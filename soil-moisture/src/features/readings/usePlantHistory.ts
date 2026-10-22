import { useQuery } from '@tanstack/react-query';
import {
  getPlantTelemetryHistory,
  PlantTelemetryHistory,
  TimeRange,
} from './historyApi';

export const PLANT_HISTORY_KEY = (plantId: string, range: TimeRange) =>
  ['plant-history', plantId, range] as const;

export function usePlantHistoryQuery(plantId: string, range: TimeRange) {
  return useQuery<PlantTelemetryHistory>({
    queryKey: PLANT_HISTORY_KEY(plantId, range),
    queryFn: () => getPlantTelemetryHistory(plantId, range),
    enabled: Boolean(plantId),
    staleTime: 1000 * 60, // 1 minute
  });
}
