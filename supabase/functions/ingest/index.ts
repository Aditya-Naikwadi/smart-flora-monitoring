// ==============================================================================
// Supabase Edge Function: ingest
// Description: Secure ingestion endpoint for ESP32 IoT telemetry
// Validates headers, authenticates device secret via SHA-256 constant-time check,
// validates payload bounds via Zod, applies sensor calibration, enforces rate limits.
// ==============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from '../_shared/cors.ts';
import { IngestHeadersSchema, TelemetryPayloadSchema } from '../_shared/schemas.ts';

// Minimum interval (in seconds) permitted between consecutive telemetry reports from one device
const MIN_REPORT_INTERVAL_SECONDS = 15;

/**
 * Constant-time string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Computes SHA-256 hex digest of a string using Web Crypto API
 */
async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

serve(async (req: Request) => {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // 2. Enforce POST method
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Use POST.' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    // 3. Extract and Validate Headers
    const deviceIdHeader = req.headers.get('x-device-id') || '';
    const deviceSecretHeader = req.headers.get('x-device-secret') || '';

    const headerValidation = IngestHeadersSchema.safeParse({
      'x-device-id': deviceIdHeader,
      'x-device-secret': deviceSecretHeader,
    });

    if (!headerValidation.success) {
      return new Response(
        JSON.stringify({
          error: 'Missing or invalid authentication headers',
          details: headerValidation.error.issues,
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { 'x-device-id': deviceId, 'x-device-secret': plainSecret } =
      headerValidation.data;

    // 4. Initialize privileged Supabase client for service-role access
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error: missing service role credentials' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 5. Look up device record
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select('id, plant_id, hashed_secret, last_seen, raw_dry_value, raw_wet_value')
      .eq('id', deviceId)
      .maybeSingle();

    if (deviceError || !device) {
      return new Response(
        JSON.stringify({ error: 'Device not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!device.plant_id) {
      return new Response(
        JSON.stringify({ error: 'Device is registered but not linked to any plant' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 6. Authenticate Secret via SHA-256
    const computedHash = await sha256Hex(plainSecret);
    const isAuthenticated = timingSafeEqual(computedHash.toLowerCase(), device.hashed_secret.toLowerCase());

    if (!isAuthenticated) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid device secret' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 7. Enforce Rate Limiting (Minimum Interval Guard)
    const now = new Date();
    if (device.last_seen) {
      const lastSeenDate = new Date(device.last_seen);
      const elapsedSeconds = (now.getTime() - lastSeenDate.getTime()) / 1000;

      if (elapsedSeconds < MIN_REPORT_INTERVAL_SECONDS) {
        return new Response(
          JSON.stringify({
            error: 'Rate limit exceeded: Telemetry is being reported too frequently.',
            min_interval_seconds: MIN_REPORT_INTERVAL_SECONDS,
            retry_after_seconds: Math.ceil(MIN_REPORT_INTERVAL_SECONDS - elapsedSeconds),
          }),
          {
            status: 429,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
              'Retry-After': String(Math.ceil(MIN_REPORT_INTERVAL_SECONDS - elapsedSeconds)),
            },
          }
        );
      }
    }

    // 8. Parse and Validate JSON Body
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Malformed JSON payload in request body' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const payloadValidation = TelemetryPayloadSchema.safeParse(rawBody);
    if (!payloadValidation.success) {
      return new Response(
        JSON.stringify({
          error: 'Validation failed for telemetry fields',
          details: payloadValidation.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const payload = payloadValidation.data;

    // 9. Compute Calibrated Soil Moisture Percentage
    // Capacitive sensor reading: raw_dry is higher ADC, raw_wet is lower ADC
    const dry = device.raw_dry_value;
    const wet = device.raw_wet_value;
    const raw = payload.soil_moisture_raw;

    let computedPercent = 0;
    if (dry > wet) {
      computedPercent = ((dry - raw) / (dry - wet)) * 100;
    }
    // Clamp to [0, 100] and round to 2 decimals
    computedPercent = Math.max(0, Math.min(100, Math.round(computedPercent * 100) / 100));

    // 10. Insert Reading Record
    const recordedAtIso = now.toISOString();
    const { data: insertedReading, error: insertError } = await supabase
      .from('readings')
      .insert({
        device_id: device.id,
        plant_id: device.plant_id,
        soil_moisture_percent: computedPercent,
        soil_moisture_raw: payload.soil_moisture_raw,
        temperature_c: payload.temperature_c,
        humidity_percent: payload.humidity_percent,
        battery_voltage: payload.battery_voltage ?? null,
        rssi: payload.rssi ?? null,
        recorded_at: recordedAtIso,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Database insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to record telemetry into database' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 11. Update Device's last_seen timestamp
    await supabase
      .from('devices')
      .update({ last_seen: recordedAtIso })
      .eq('id', device.id);

    // 12. Return Success Response
    return new Response(
      JSON.stringify({
        success: true,
        reading_id: insertedReading.id,
        plant_id: device.plant_id,
        computed_moisture_percent: computedPercent,
        recorded_at: recordedAtIso,
      }),
      {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('Unexpected ingest error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error processing telemetry' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
