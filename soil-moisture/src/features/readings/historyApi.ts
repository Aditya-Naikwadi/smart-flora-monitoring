import { supabase } from '@/lib/supabase';

export type TimeRange = '24h' | '7d' | '30d';
export type MetricType = 'moisture' | 'temperature' | 'humidity';

export interface ChartDataPoint {
  value: number;
  label: string;
  timestamp: string;
}

export interface HistoryStats {
  min: number;
  max: number;
  avg: number;
  latest: number;
}

export interface PlantTelemetryHistory {
  moisturePoints: ChartDataPoint[];
  temperaturePoints: ChartDataPoint[];
  humidityPoints: ChartDataPoint[];
  stats: {
    moisture: HistoryStats;
    temperature: HistoryStats;
    humidity: HistoryStats;
  };
}

/**
 * Fetches time-series data for a plant based on time range (24h, 7d, 30d).
 * Optimizes performance by querying raw readings for 24h, and hourly rollups for 7d/30d.
 */
export async function getPlantTelemetryHistory(
  plantId: string,
  range: TimeRange
): Promise<PlantTelemetryHistory> {
  const now = new Date();
  let startTime: Date;

  if (range === '24h') {
    startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  } else if (range === '7d') {
    startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else {
    startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  const startTimeIso = startTime.toISOString();

  // If 24h range, fetch from raw readings
  if (range === '24h') {
    const { data: rawReadings, error } = await supabase
      .from('readings')
      .select('soil_moisture_percent, temperature_c, humidity_percent, recorded_at')
      .eq('plant_id', plantId)
      .gte('recorded_at', startTimeIso)
      .order('recorded_at', { ascending: true })
      .limit(200);

    if (error) {
      throw new Error(`Failed to fetch 24h readings: ${error.message}`);
    }

    const readings = rawReadings || [];
    return processPoints(
      readings.map((r, index) => {
        const date = new Date(r.recorded_at);
        // Show hour label every 4 points
        const showLabel = index % Math.max(1, Math.floor(readings.length / 6)) === 0;
        const label = showLabel
          ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '';

        return {
          timestamp: r.recorded_at,
          label,
          moisture: Number(r.soil_moisture_percent),
          temperature: Number(r.temperature_c),
          humidity: Number(r.humidity_percent),
        };
      })
    );
  }

  // If 7d or 30d range, query hourly rollups for optimal performance
  const { data: hourlyData, error } = await supabase
    .from('hourly_readings')
    .select('avg_soil_moisture, avg_temperature_c, avg_humidity_percent, bucket_start')
    .eq('plant_id', plantId)
    .gte('bucket_start', startTimeIso)
    .order('bucket_start', { ascending: true })
    .limit(300);

  if (error) {
    throw new Error(`Failed to fetch historical rollups: ${error.message}`);
  }

  // Also include any raw readings from the last 24h that haven't rolled up yet
  const yesterdayIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentRaw } = await supabase
    .from('readings')
    .select('soil_moisture_percent, temperature_c, humidity_percent, recorded_at')
    .eq('plant_id', plantId)
    .gte('recorded_at', yesterdayIso)
    .order('recorded_at', { ascending: true })
    .limit(50);

  // Combine and format
  const combined = [
    ...(hourlyData || []).map((h) => ({
      timestamp: h.bucket_start,
      moisture: Number(h.avg_soil_moisture),
      temperature: Number(h.avg_temperature_c),
      humidity: Number(h.avg_humidity_percent),
    })),
    ...(recentRaw || []).map((r) => ({
      timestamp: r.recorded_at,
      moisture: Number(r.soil_moisture_percent),
      temperature: Number(r.temperature_c),
      humidity: Number(r.humidity_percent),
    })),
  ];

  return processPoints(
    combined.map((item, index) => {
      const date = new Date(item.timestamp);
      const showLabel = index % Math.max(1, Math.floor(combined.length / 6)) === 0;
      const label = showLabel
        ? range === '7d'
          ? date.toLocaleDateString([], { weekday: 'short' })
          : date.toLocaleDateString([], { month: 'numeric', day: 'numeric' })
        : '';

      return {
        ...item,
        label,
      };
    })
  );
}

function processPoints(
  items: { timestamp: string; label: string; moisture: number; temperature: number; humidity: number }[]
): PlantTelemetryHistory {
  if (items.length === 0) {
    const emptyStats: HistoryStats = { min: 0, max: 0, avg: 0, latest: 0 };
    return {
      moisturePoints: [],
      temperaturePoints: [],
      humidityPoints: [],
      stats: { moisture: emptyStats, temperature: emptyStats, humidity: emptyStats },
    };
  }

  const moistureVals = items.map((i) => i.moisture);
  const tempVals = items.map((i) => i.temperature);
  const humVals = items.map((i) => i.humidity);

  const computeStats = (vals: number[]): HistoryStats => {
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = Number((sum / vals.length).toFixed(1));
    const latest = vals[vals.length - 1];
    return { min, max, avg, latest };
  };

  return {
    moisturePoints: items.map((i) => ({ value: i.moisture, label: i.label, timestamp: i.timestamp })),
    temperaturePoints: items.map((i) => ({ value: i.temperature, label: i.label, timestamp: i.timestamp })),
    humidityPoints: items.map((i) => ({ value: i.humidity, label: i.label, timestamp: i.timestamp })),
    stats: {
      moisture: computeStats(moistureVals),
      temperature: computeStats(tempVals),
      humidity: computeStats(humVals),
    },
  };
}
