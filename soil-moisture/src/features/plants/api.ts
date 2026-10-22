import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database.types';

export type Plant = Database['public']['Tables']['plants']['Row'];
export type Device = Database['public']['Tables']['devices']['Row'];
export type Reading = Database['public']['Tables']['readings']['Row'];

export interface PlantWithTelemetry extends Plant {
  device: Device | null;
  latestReading: Reading | null;
  healthStatus: 'healthy' | 'needs_water' | 'overwatered' | 'too_hot' | 'too_cold' | 'offline';
}

/**
 * Determines overall plant health status based on thresholds and device heartbeat
 */
export function calculatePlantHealth(
  plant: Plant,
  device: Device | null,
  latestReading: Reading | null
): PlantWithTelemetry['healthStatus'] {
  if (!device || !device.last_seen) {
    return 'offline';
  }

  // Device is considered offline if no reading within 3 reporting intervals (min 15 mins)
  const reportingInterval = device.reporting_interval_seconds || 300;
  const offlineThresholdMs = Math.max(reportingInterval * 3 * 1000, 15 * 60 * 1000);
  const timeSinceLastSeen = Date.now() - new Date(device.last_seen).getTime();

  if (timeSinceLastSeen > offlineThresholdMs) {
    return 'offline';
  }

  if (!latestReading) {
    return 'healthy';
  }

  // Check moisture bounds
  if (latestReading.soil_moisture_percent < plant.min_soil_moisture) {
    return 'needs_water';
  }
  if (latestReading.soil_moisture_percent > plant.max_soil_moisture) {
    return 'overwatered';
  }

  // Check temperature bounds
  if (latestReading.temperature_c > plant.max_temperature_c) {
    return 'too_hot';
  }
  if (latestReading.temperature_c < plant.min_temperature_c) {
    return 'too_cold';
  }

  return 'healthy';
}

/**
 * Fetches all plants owned by current user along with their paired device and latest telemetry reading
 */
export async function getPlantsWithTelemetry(): Promise<PlantWithTelemetry[]> {
  const { data: plants, error: plantsError } = await supabase
    .from('plants')
    .select('*')
    .order('created_at', { ascending: false });

  if (plantsError) {
    throw new Error(`Failed to fetch plants: ${plantsError.message}`);
  }

  if (!plants || plants.length === 0) {
    return [];
  }

  const plantIds = plants.map((p) => p.id);

  // Fetch linked devices
  const { data: devices } = await supabase
    .from('devices')
    .select('*')
    .in('plant_id', plantIds);

  const deviceMap = new Map<string, Device>();
  for (const d of devices || []) {
    if (d.plant_id) {
      deviceMap.set(d.plant_id, d);
    }
  }

  // Fetch the latest reading for each plant
  // Query recent readings for these plants
  const { data: readings } = await supabase
    .from('readings')
    .select('*')
    .in('plant_id', plantIds)
    .order('recorded_at', { ascending: false });

  const latestReadingMap = new Map<string, Reading>();
  for (const r of readings || []) {
    if (!latestReadingMap.has(r.plant_id)) {
      latestReadingMap.set(r.plant_id, r);
    }
  }

  return plants.map((plant) => {
    const device = deviceMap.get(plant.id) ?? null;
    const latestReading = latestReadingMap.get(plant.id) ?? null;
    const healthStatus = calculatePlantHealth(plant, device, latestReading);

    return {
      ...plant,
      device,
      latestReading,
      healthStatus,
    };
  });
}

/**
 * Fetches single plant detail, device status, and recent readings
 */
export async function getPlantDetail(plantId: string): Promise<{
  plant: Plant;
  device: Device | null;
  latestReading: Reading | null;
  recentReadings: Reading[];
}> {
  const { data: plant, error: plantError } = await supabase
    .from('plants')
    .select('*')
    .eq('id', plantId)
    .single();

  if (plantError || !plant) {
    throw new Error(`Plant not found: ${plantError?.message}`);
  }

  const { data: device } = await supabase
    .from('devices')
    .select('*')
    .eq('plant_id', plantId)
    .maybeSingle();

  const { data: recentReadings } = await supabase
    .from('readings')
    .select('*')
    .eq('plant_id', plantId)
    .order('recorded_at', { ascending: false })
    .limit(30);

  const readingsList = recentReadings || [];
  const latestReading = readingsList[0] ?? null;

  return {
    plant,
    device: device ?? null,
    latestReading,
    recentReadings: readingsList,
  };
}

export interface CreatePlantInput {
  name: string;
  species?: string;
  photo_url?: string;
  location_note?: string;
  min_soil_moisture?: number;
  max_soil_moisture?: number;
  min_temperature_c?: number;
  max_temperature_c?: number;
  min_humidity_percent?: number;
  max_humidity_percent?: number;
  alert_cooldown_minutes?: number;
  deviceName: string;
  reportingIntervalSeconds?: number;
}

export interface PairDeviceResult {
  plantId: string;
  plantName: string;
  deviceId: string;
  deviceName: string;
  plainSecret: string;
}

/**
 * Creates plant and atomically provisions ESP32 device with secure SHA-256 hashed secret
 */
export async function createPlantAndPairDevice(
  input: CreatePlantInput
): Promise<PairDeviceResult> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    throw new Error('Not authenticated');
  }

  // 1. Insert Plant record
  const { data: newPlant, error: plantError } = await supabase
    .from('plants')
    .insert({
      owner_id: user.user.id,
      name: input.name.trim(),
      species: input.species?.trim() || null,
      photo_url: input.photo_url?.trim() || null,
      location_note: input.location_note?.trim() || null,
      min_soil_moisture: input.min_soil_moisture ?? 30,
      max_soil_moisture: input.max_soil_moisture ?? 80,
      min_temperature_c: input.min_temperature_c ?? 15,
      max_temperature_c: input.max_temperature_c ?? 35,
      min_humidity_percent: input.min_humidity_percent ?? 40,
      max_humidity_percent: input.max_humidity_percent ?? 85,
      alert_cooldown_minutes: input.alert_cooldown_minutes ?? 60,
    })
    .select()
    .single();

  if (plantError || !newPlant) {
    throw new Error(`Failed to create plant: ${plantError?.message}`);
  }

  // 2. Call secure pair_device RPC to generate device with hashed secret
  const { data: deviceResult, error: pairError } = await supabase.rpc('pair_device', {
    p_plant_id: newPlant.id,
    p_name: input.deviceName.trim(),
    p_raw_dry: 3200,
    p_raw_wet: 1400,
    p_interval: input.reportingIntervalSeconds ?? 300,
  });

  if (pairError || !deviceResult || deviceResult.length === 0) {
    throw new Error(`Failed to provision device: ${pairError?.message}`);
  }

  const paired = deviceResult[0];

  return {
    plantId: newPlant.id,
    plantName: newPlant.name,
    deviceId: paired.device_id,
    deviceName: paired.device_name,
    plainSecret: paired.plain_secret,
  };
}
