import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PLANT_DETAIL_QUERY_KEY, PLANTS_QUERY_KEY } from './usePlants';

export interface UpdateThresholdsInput {
  plantId: string;
  min_soil_moisture: number;
  max_soil_moisture: number;
  min_temperature_c: number;
  max_temperature_c: number;
  min_humidity_percent: number;
  max_humidity_percent: number;
  alert_cooldown_minutes: number;
}

export function useUpdatePlantThresholds(onSuccess?: () => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateThresholdsInput) => {
      const { plantId, ...thresholds } = input;
      const { data, error } = await supabase
        .from('plants')
        .update(thresholds)
        .eq('id', plantId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update thresholds: ${error.message}`);
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: PLANT_DETAIL_QUERY_KEY(variables.plantId) });
      queryClient.invalidateQueries({ queryKey: PLANTS_QUERY_KEY });
      onSuccess?.();
    },
  });
}
