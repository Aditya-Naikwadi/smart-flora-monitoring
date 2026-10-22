import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreatePlantInput,
  createPlantAndPairDevice,
  getPlantDetail,
  getPlantsWithTelemetry,
  PairDeviceResult,
  PlantWithTelemetry,
} from './api';

export const PLANTS_QUERY_KEY = ['plants'] as const;
export const PLANT_DETAIL_QUERY_KEY = (id: string) => ['plant', id] as const;

export function usePlantsQuery() {
  return useQuery<PlantWithTelemetry[]>({
    queryKey: PLANTS_QUERY_KEY,
    queryFn: getPlantsWithTelemetry,
    refetchInterval: 1000 * 30, // 30s background fallback refresh
  });
}

export function usePlantDetailQuery(plantId: string) {
  return useQuery({
    queryKey: PLANT_DETAIL_QUERY_KEY(plantId),
    queryFn: () => getPlantDetail(plantId),
    enabled: Boolean(plantId),
    refetchInterval: 1000 * 20,
  });
}

export function useCreatePlantMutation(
  onSuccess?: (result: PairDeviceResult) => void
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePlantInput) => createPlantAndPairDevice(input),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: PLANTS_QUERY_KEY });
      onSuccess?.(result);
    },
  });
}
