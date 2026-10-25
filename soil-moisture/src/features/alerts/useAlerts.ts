import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  acknowledgeAlert,
  acknowledgeAllAlerts,
  AlertWithPlant,
  getUserAlerts,
} from './api';

export const ALERTS_QUERY_KEY = (filterPlantId?: string) =>
  ['alerts', filterPlantId || 'all'] as const;

export function useAlertsQuery(filterPlantId?: string) {
  const queryClient = useQueryClient();

  // Realtime subscription for instant new incident alerts
  useEffect(() => {
    const instanceId = Math.random().toString(36).substring(7);
    const channelName = `alerts:${instanceId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'alerts' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['alerts'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery<AlertWithPlant[]>({
    queryKey: ALERTS_QUERY_KEY(filterPlantId),
    queryFn: () => getUserAlerts(filterPlantId),
    refetchInterval: 1000 * 30,
  });
}

export function useAcknowledgeAlertMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (alertId: string) => acknowledgeAlert(alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export function useAcknowledgeAllAlertsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (plantId?: string) => acknowledgeAllAlerts(plantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}
