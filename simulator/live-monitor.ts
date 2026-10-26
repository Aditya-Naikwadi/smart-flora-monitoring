import fs from 'node:fs';
import path from 'node:path';

// Load Supabase environment variables from soil-moisture or current dir
const envPaths = [
  path.join(__dirname, '..', 'soil-moisture', '.env'),
  path.join(__dirname, '.env'),
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = (match[2] || '').trim().replace(/^['"]|['"]$/g, '');
      }
    }
  }
}

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://jtxatelmmgsprghvtyhh.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_EivbdBfQUKHp1uT_ri-Zdw_8s2EKxP4';

// ANSI colors for clean terminal visualization
const green = (t: string) => `\x1b[32m${t}\x1b[0m`;
const red = (t: string) => `\x1b[31m${t}\x1b[0m`;
const cyan = (t: string) => `\x1b[36m${t}\x1b[0m`;
const yellow = (t: string) => `\x1b[33m${t}\x1b[0m`;
const magenta = (t: string) => `\x1b[35m${t}\x1b[0m`;
const bold = (t: string) => `\x1b[1m${t}\x1b[0m`;
const gray = (t: string) => `\x1b[90m${t}\x1b[0m`;

interface SensorReading {
  id: string;
  plant_id: string;
  device_id: string;
  soil_moisture_percent: number;
  soil_moisture_raw: number;
  temperature_c: number;
  humidity_percent: number;
  battery_voltage?: number;
  rssi?: number;
  recorded_at: string;
}

interface DeviceRecord {
  id: string;
  name: string;
  plant_id: string;
}

const seenIds = new Set<string>();
const deviceCache = new Map<string, string>();

async function fetchDeviceNames(): Promise<void> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/devices?select=id,name,plant_id`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (res.ok) {
      const devices = (await res.json()) as DeviceRecord[];
      for (const d of devices) {
        deviceCache.set(d.id, d.name);
      }
    }
  } catch {
    // Non-fatal
  }
}

async function fetchLatestReadings(): Promise<SensorReading[]> {
  const url = `${SUPABASE_URL}/rest/v1/readings?select=*&order=recorded_at.desc&limit=15`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Supabase query failed: HTTP ${res.status}`);
  }

  return (await res.json()) as SensorReading[];
}

function formatReading(r: SensorReading): void {
  const timestamp = new Date(r.recorded_at).toLocaleTimeString();
  const deviceName = deviceCache.get(r.device_id) || r.device_id.slice(0, 8);

  const moistureColor =
    r.soil_moisture_percent < 25
      ? red
      : r.soil_moisture_percent < 40
      ? yellow
      : green;

  const tempStr =
    r.temperature_c != null ? `${yellow(`${r.temperature_c.toFixed(1)}°C`)}` : gray('N/A');

  const humStr =
    r.humidity_percent != null
      ? `${cyan(`${r.humidity_percent.toFixed(1)}%`)}`
      : gray('N/A');

  const batteryStr =
    r.battery_voltage != null
      ? `🔋 ${r.battery_voltage.toFixed(2)}V`
      : '';

  const rssiStr =
    r.rssi != null
      ? `📶 ${r.rssi}dBm`
      : '';

  console.log(
    `[${gray(timestamp)}] 🌿 ${bold(deviceName)} -> ` +
      `💧 Moisture: ${moistureColor(bold(`${r.soil_moisture_percent}%`))} ${gray(`(raw: ${r.soil_moisture_raw})`)} | ` +
      `🌡️  Temp: ${tempStr} | ` +
      `💨 Hum: ${humStr} ` +
      `${batteryStr ? `| ${gray(batteryStr)} ` : ''}` +
      `${rssiStr ? `| ${gray(rssiStr)}` : ''}`
  );
}

async function startMonitor(): Promise<void> {
  console.log(bold('\n============================================================='));
  console.log(bold('        🌿 Smart Flora - Live Physical Sensor Monitor        '));
  console.log(bold('============================================================='));
  console.log(`Cloud Endpoint: ${cyan(SUPABASE_URL)}`);
  console.log(`Mode:           ${green('PASSIVE LISTENER (Zero fake/simulated data)')}`);
  console.log(gray('Listening for real incoming telemetry transmissions from ESP32...'));
  console.log(gray('Press Ctrl+C to stop.\n'));

  await fetchDeviceNames();

  // Populate already existing IDs so we only alert on newly incoming readings
  try {
    const existing = await fetchLatestReadings();
    for (const r of existing) {
      seenIds.add(r.id);
    }
    if (existing.length > 0) {
      console.log(cyan(`[System] Initialized. Last recorded reading in cloud:`));
      formatReading(existing[0]);
      console.log(gray('\n--- Waiting for next live reading from physical sensor ---\n'));
    }
  } catch (err: unknown) {
    console.error(red(`[Error] Could not initialize readings: ${(err as Error).message}`));
  }

  // Poll loop for real sensor transmissions every 2.5 seconds
  setInterval(async () => {
    try {
      const readings = await fetchLatestReadings();
      // Reverse to display oldest first if multiple arrived
      for (const r of readings.reverse()) {
        if (!seenIds.has(r.id)) {
          seenIds.add(r.id);
          formatReading(r);
        }
      }
    } catch {
      // Ignore transient network hiccups
    }
  }, 2500);
}

startMonitor().catch(console.error);
