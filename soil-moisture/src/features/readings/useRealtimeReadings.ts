import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PLANT_DETAIL_QUERY_KEY, PLANTS_QUERY_KEY } from '@/features/plants/usePlants';
import { calculatePlantHealth, Plant, PlantWithTelemetry, Reading } from '@/features/plants/api';

export type RealtimeStatus = 'connected' | 'connecting' | 'disconnected' | 'fallback_polling';

/**
 * Hook to subscribe to live telemetry via Supabase Realtime WebSocket
 * Automatically updates caches on incoming readings and provides
 * active periodic polling fallback if connection is interrupted.
 */
export function useRealtimeReadings(plantId?: string) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);
  const [liveReading, setLiveReading] = useState<Reading | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Unique channel identifier per hook instance to prevent channel collisions
    const instanceId = Math.random().toString(36).substring(7);
    const channelName = plantId
      ? `readings:plant:${plantId}:${instanceId}`
      : `readings:all:${instanceId}`;

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
          const newReading = payload.new as Reading;
          if (newReading && newReading.id) {
            setLastEventAt(new Date(newReading.recorded_at || Date.now()));
            setLiveReading(newReading);

            // 1. Instantly update plant detail cache with zero latency
            if (newReading.plant_id) {
              queryClient.setQueryData(
                PLANT_DETAIL_QUERY_KEY(newReading.plant_id),
                (prev: { plant: Plant; device: any; latestReading: Reading | null; recentReadings: Reading[] } | undefined) => {
                  if (!prev) return prev;
                  const filtered = (prev.recentReadings || []).filter((r) => r.id !== newReading.id);
                  return {
                    ...prev,
                    latestReading: newReading,
                    recentReadings: [newReading, ...filtered].slice(0, 30),
                  };
                }
              );

              // 2. Invalidate time-series history charts
              queryClient.invalidateQueries({ queryKey: ['plant-history', newReading.plant_id] });
            }

            // 3. Update dashboard plant collection list
            queryClient.setQueryData(
              PLANTS_QUERY_KEY,
              (prev: PlantWithTelemetry[] | undefined) => {
                if (!prev) return prev;
                return prev.map((p) => {
                  if (p.id === newReading.plant_id) {
                    return {
                      ...p,
                      latestReading: newReading,
                      healthStatus: calculatePlantHealth(p, p.device, newReading),
                    };
                  }
                  return p;
                });
              }
            );

            // Invalidate to guarantee synchronization
            queryClient.invalidateQueries({ queryKey: PLANTS_QUERY_KEY });
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
          if (plantId) {
            queryClient.invalidateQueries({ queryKey: PLANT_DETAIL_QUERY_KEY(plantId) });
          }
        }
      )
      .subscribe((subscribeStatus) => {
        if (subscribeStatus === 'SUBSCRIBED') {
          setStatus('connected');
        } else if (
          subscribeStatus === 'CLOSED' ||
          subscribeStatus === 'CHANNEL_ERROR' ||
          subscribeStatus === 'TIMED_OUT'
        ) {
          setStatus('fallback_polling');
        } else {
          setStatus('connecting');
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, plantId]);

  // Active polling fallback when WebSocket is offline or in fallback mode
  useEffect(() => {
    if (status === 'fallback_polling' || status === 'disconnected') {
      pollingRef.current = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: PLANTS_QUERY_KEY });
        if (plantId) {
          queryClient.invalidateQueries({ queryKey: PLANT_DETAIL_QUERY_KEY(plantId) });
          queryClient.invalidateQueries({ queryKey: ['plant-history', plantId] });
        }
      }, 10000); // 10-second active poll interval
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [status, plantId, queryClient]);

  return {
    status,
    isConnected: status === 'connected',
    lastEventAt,
    liveReading,
  };
}
