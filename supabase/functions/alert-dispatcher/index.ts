// ==============================================================================
// Supabase Edge Function: alert-dispatcher
// Description: Evaluates offline devices and dispatches remote push notifications
// to Expo Push Service (https://exp.host/--/api/v2/push/send).
// ==============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from '../_shared/cors.ts';

interface ExpoPushMessage {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data: Record<string, unknown>;
  priority: 'high';
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Missing service role configuration' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // 1. Run offline device detector sweep in Postgres
    const { data: offlineCount, error: sweepError } = await supabase.rpc('check_offline_devices');
    if (sweepError) {
      console.warn('Offline sweeper notice:', sweepError.message);
    }

    // 2. Fetch unacknowledged alerts created in the last 15 minutes that haven't been pushed
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: pendingAlerts, error: alertsError } = await supabase
      .from('alerts')
      .select('id, plant_id, type, message, created_at, plants(name, owner_id)')
      .eq('acknowledged', false)
      .gte('created_at', fifteenMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(50);

    if (alertsError) {
      throw new Error(`Failed to query pending alerts: ${alertsError.message}`);
    }

    if (!pendingAlerts || pendingAlerts.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No pending unacknowledged alerts to dispatch.',
          offlineDevicesChecked: offlineCount ?? 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 3. Collect unique plant owners to fetch their Expo push tokens
    const ownerIds = Array.from(
      new Set(
        pendingAlerts
          .map((a) => (a.plants as unknown as { owner_id: string } | null)?.owner_id)
          .filter(Boolean) as string[]
      )
    );

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, expo_push_token, notification_enabled')
      .in('id', ownerIds)
      .eq('notification_enabled', true)
      .not('expo_push_token', 'is', null);

    const tokenMap = new Map<string, string>();
    for (const p of profiles || []) {
      if (p.expo_push_token) {
        tokenMap.set(p.id, p.expo_push_token);
      }
    }

    // 4. Construct push notification messages for Expo Push API
    const pushMessages: ExpoPushMessage[] = [];

    for (const alert of pendingAlerts) {
      const plant = alert.plants as unknown as { name: string; owner_id: string } | null;
      if (!plant) continue;

      const pushToken = tokenMap.get(plant.owner_id);
      if (!pushToken) continue;

      const title =
        alert.type === 'device_offline'
          ? `⚠️ Sensor Offline: ${plant.name}`
          : alert.type === 'device_online'
          ? `✅ Back Online: ${plant.name}`
          : `🚨 Health Alert: ${plant.name}`;

      pushMessages.push({
        to: pushToken,
        sound: 'default',
        title,
        body: alert.message,
        data: {
          alertId: alert.id,
          plantId: alert.plant_id,
          type: alert.type,
        },
        priority: 'high',
      });
    }

    let dispatchedCount = 0;

    // 5. Dispatch batch to Expo Push Service (Free API)
    if (pushMessages.length > 0) {
      const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(pushMessages),
      });

      const expoResult = await expoResponse.json();
      dispatchedCount = pushMessages.length;
      console.log('Expo Push Response:', expoResult);
    }

    return new Response(
      JSON.stringify({
        success: true,
        alertsProcessed: pendingAlerts.length,
        pushDispatched: dispatchedCount,
        offlineDevicesDetected: offlineCount ?? 0,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: unknown) {
    console.error('Alert dispatcher error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || 'Dispatcher failed' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
