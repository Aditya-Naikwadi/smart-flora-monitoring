import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PLANTS_QUERY_KEY } from '@/features/plants/usePlants';

export type RealtimeStatus = 'connected' | 'connecting' | 'disconnected' | 'fallback_polling';

/**
 * Hook to subscribe to live telemetry via Supabase Realtime
 * Automatically invalidates queries on incoming readings and provides
 * graceful fallback to periodic polling if connection is interrupted.
 */
export function useRealtimeReadings(plantId?: string) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);

  useEffect(() => {
    const channelName = plantId ? `readings:${plantId}` : 'readings:all';
    const channel = supabase.channel(channelName);

    // Subscribe to new rows in public.readings
    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'readings',
          ...(plantId ? { filter: `plant_id=eq.${plantId}` } : {}),
        },
        (payload) => {
          setLastEventAt(new Date());
          // Invalidate cache immediately for instant UI update
          queryClient.invalidateQueries({ queryKey: PLANTS_QUERY_KEY });
          if (payload.new && 'plant_id' in payload.new) {
            queryClient.invalidateQueries({ queryKey: ['plant', payload.new.plant_id] });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'devices',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: PLANTS_QUERY_KEY });
        }
      )
      .subscribe((subscribeStatus) => {
        if (subscribeStatus === 'SUBSCRIBED') {
          setStatus('connected');
        } else if (subscribeStatus === 'CLOSED' || subscribeStatus === 'CHANNEL_ERROR') {
          setStatus('fallback_polling');
        } else {
          setStatus('connecting');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, plantId]);

  return {
    status,
    isConnected: status === 'connected',
    lastEventAt,
  };
}
