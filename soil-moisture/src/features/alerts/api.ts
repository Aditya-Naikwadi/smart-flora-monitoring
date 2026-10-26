import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database.types';

export type AlertRecord = Database['public']['Tables']['alerts']['Row'];

export interface AlertWithPlant extends AlertRecord {
  plantName: string;
}

const DEMO_PLANT_IDS = new Set([
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
]);

/**
 * Fetches all real alerts, optionally filtered by plantId
 */
export async function getUserAlerts(filterPlantId?: string): Promise<AlertWithPlant[]> {
  let query = supabase
    .from('alerts')
    .select('*, plants(name)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (filterPlantId) {
    query = query.eq('plant_id', filterPlantId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load alerts: ${error.message}`);
  }

  return (data || [])
    .filter((item) => !DEMO_PLANT_IDS.has(item.plant_id))
    .map((item) => {
      const plantObj = item.plants as unknown as { name: string } | null;
      return {
        ...item,
        plantName: plantObj?.name || 'Plant',
      };
    });
}

/**
 * Acknowledges a specific alert
 */
export async function acknowledgeAlert(alertId: string): Promise<void> {
  const { error } = await supabase
    .from('alerts')
    .update({
      acknowledged: true,
      acknowledged_at: new Date().toISOString(),
    })
    .eq('id', alertId);

  if (error) {
    throw new Error(`Failed to acknowledge alert: ${error.message}`);
  }
}

/**
 * Marks all pending alerts as acknowledged
 */
export async function acknowledgeAllAlerts(plantId?: string): Promise<void> {
  let query = supabase
    .from('alerts')
    .update({
      acknowledged: true,
      acknowledged_at: new Date().toISOString(),
    })
    .eq('acknowledged', false);

  if (plantId) {
    query = query.eq('plant_id', plantId);
  }

  const { error } = await query;
  if (error) {
    throw new Error(`Failed to acknowledge all alerts: ${error.message}`);
  }
}
