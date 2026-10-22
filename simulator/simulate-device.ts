/**
 * ESP32 Hardware Simulator & Ingestion Test Suite
 *
 * Usage:
 *   # Run automated compliance tests against Ingest endpoint:
 *   npx tsx simulate-device.ts --test --url https://<project-ref>.functions.supabase.co/ingest
 *
 *   # Stream live simulated telemetry (e.g., every 30s):
 *   npx tsx simulate-device.ts --stream --url https://<project-ref>.functions.supabase.co/ingest
 */

interface DeviceConfig {
  name: string;
  id: string;
  secret: string;
  rawDry: number;
  rawWet: number;
}

const DEMO_DEVICES: DeviceConfig[] = [
  {
    name: 'Monstera Deliciosa (Living Room)',
    id: '33333333-3333-3333-3333-333333333333',
    secret: 'test_secret_monstera_1234567890abcdef',
    rawDry: 3200,
    rawWet: 1400,
  },
  {
    name: 'Snake Plant (Office Desk)',
    id: '44444444-4444-4444-4444-444444444444',
    secret: 'test_secret_snakeplant_1234567890abcdef',
    rawDry: 3350,
    rawWet: 1450,
  },
];

// CLI Argument parsing
const args = process.argv.slice(2);
const isTestMode = args.includes('--test');
const isStreamMode = args.includes('--stream') || (!isTestMode && args.length === 0);

const urlIndex = args.indexOf('--url');
const INGEST_URL =
  urlIndex !== -1 && args[urlIndex + 1]
    ? args[urlIndex + 1]
    : process.env.INGEST_URL || 'http://127.0.0.1:54321/functions/v1/ingest';

const intervalIndex = args.indexOf('--interval');
const STREAM_INTERVAL_SEC =
  intervalIndex !== -1 && args[intervalIndex + 1]
    ? Math.max(15, parseInt(args[intervalIndex + 1], 10))
    : 20;

// Terminal styling
const green = (t: string) => `\x1b[32m${t}\x1b[0m`;
const red = (t: string) => `\x1b[31m${t}\x1b[0m`;
const cyan = (t: string) => `\x1b[36m${t}\x1b[0m`;
const yellow = (t: string) => `\x1b[33m${t}\x1b[0m`;
const bold = (t: string) => `\x1b[1m${t}\x1b[0m`;

async function postTelemetry(
  url: string,
  deviceId: string,
  deviceSecret: string,
  payload: Record<string, unknown>
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': deviceId,
      'x-device-secret': deviceSecret,
    },
    body: JSON.stringify(payload),
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }

  return { status: response.status, body, headers: response.headers };
}

/**
 * ------------------------------------------------------------------------------
 * Automated Test Suite
 * ------------------------------------------------------------------------------
 */
async function runComplianceTests() {
  console.log(bold('\n============================================================='));
  console.log(bold('  ESP32 Ingestion Endpoint Compliance & Security Test Suite  '));
  console.log(bold('============================================================='));
  console.log(`Target URL: ${cyan(INGEST_URL)}\n`);

  const primaryDevice = DEMO_DEVICES[0];
  let passed = 0;
  let failed = 0;

  async function assertCase(
    name: string,
    action: () => Promise<boolean>,
    details?: string
  ) {
    process.stdout.write(`• ${name} ... `);
    try {
      const ok = await action();
      if (ok) {
        console.log(green('PASSED'));
        passed++;
      } else {
        console.log(red('FAILED'));
        if (details) console.log(`  └─ Details: ${yellow(details)}`);
        failed++;
      }
    } catch (err: unknown) {
      console.log(red('ERROR'));
      console.log(`  └─ Exception: ${(err as Error).message}`);
      failed++;
    }
  }

  // 1. Valid Telemetry
  await assertCase(
    'Test 1: Valid telemetry payload with matching secret -> Expects HTTP 201',
    async () => {
      const res = await postTelemetry(INGEST_URL, primaryDevice.id, primaryDevice.secret, {
        soil_moisture_raw: 2150,
        temperature_c: 23.4,
        humidity_percent: 58.2,
        battery_voltage: 4.12,
        rssi: -65,
      });
      return res.status === 201 && (res.body as { success?: boolean })?.success === true;
    }
  );

  // 2. Invalid Secret (Security check)
  await assertCase(
    'Test 2: Tampered device secret -> Expects HTTP 401 Unauthorized',
    async () => {
      const res = await postTelemetry(
        INGEST_URL,
        primaryDevice.id,
        'wrong_attacker_secret_1234567890abcdef',
        {
          soil_moisture_raw: 2150,
          temperature_c: 23.4,
          humidity_percent: 58.2,
        }
      );
      return res.status === 401;
    }
  );

  // 3. Unknown Device UUID
  await assertCase(
    'Test 3: Unregistered device UUID -> Expects HTTP 404 Not Found',
    async () => {
      const res = await postTelemetry(
        INGEST_URL,
        '00000000-dead-beef-0000-000000000000',
        primaryDevice.secret,
        {
          soil_moisture_raw: 2150,
          temperature_c: 23.4,
          humidity_percent: 58.2,
        }
      );
      return res.status === 404;
    }
  );

  // 4. Out-of-bounds telemetry (Zod validation check)
  await assertCase(
    'Test 4: Physically impossible temperature (125°C) -> Expects HTTP 400 Bad Request',
    async () => {
      const res = await postTelemetry(INGEST_URL, primaryDevice.id, primaryDevice.secret, {
        soil_moisture_raw: 2150,
        temperature_c: 125.0, // Exceeds 80°C bound
        humidity_percent: 58.2,
      });
      return res.status === 400;
    }
  );

  // 5. Rate limiting test
  await assertCase(
    'Test 5: Rapid fire telemetry (<15s) -> Expects HTTP 429 Rate Limit',
    async () => {
      // First call (valid)
      await postTelemetry(INGEST_URL, primaryDevice.id, primaryDevice.secret, {
        soil_moisture_raw: 2150,
        temperature_c: 23.4,
        humidity_percent: 58.2,
      });
      // Immediate second call (<1s later)
      const rapidRes = await postTelemetry(INGEST_URL, primaryDevice.id, primaryDevice.secret, {
        soil_moisture_raw: 2150,
        temperature_c: 23.5,
        humidity_percent: 58.1,
      });
      return rapidRes.status === 429;
    }
  );

  console.log(bold('\n-------------------------------------------------------------'));
  console.log(`Results: ${green(`${passed} passed`)}, ${failed > 0 ? red(`${failed} failed`) : '0 failed'}`);
  console.log(bold('=============================================================\n'));
}

/**
 * ------------------------------------------------------------------------------
 * Continuous Realistic Telemetry Generator
 * ------------------------------------------------------------------------------
 */
async function startStreaming() {
  console.log(bold('\n============================================================='));
  console.log(bold('       ESP32 Continuous Telemetry Stream Simulator          '));
  console.log(bold('============================================================='));
  console.log(`Target URL: ${cyan(INGEST_URL)}`);
  console.log(`Interval:   ${cyan(`${STREAM_INTERVAL_SEC} seconds`)}`);
  console.log(`Press Ctrl+C to stop streaming.\n`);

  let cycle = 0;

  async function tick() {
    cycle++;
    const nowStr = new Date().toLocaleTimeString();

    for (const device of DEMO_DEVICES) {
      // Generate realistic botanical telemetry with sinusoidal cycle
      const hourOffset = (cycle * 0.1) % (Math.PI * 2);
      const temp = 22.0 + Math.sin(hourOffset) * 4.5 + (Math.random() * 0.4 - 0.2);
      const hum = 55.0 - Math.sin(hourOffset) * 12.0 + (Math.random() * 1.0 - 0.5);

      // Soil dries slowly over cycles, with slight noise
      const dryRange = device.rawDry - device.rawWet;
      const targetPercent = Math.max(25, 60 - cycle * 0.5);
      const rawSoil = Math.round(device.rawDry - (targetPercent / 100) * dryRange + (Math.random() * 20 - 10));

      const payload = {
        soil_moisture_raw: rawSoil,
        temperature_c: parseFloat(temp.toFixed(2)),
        humidity_percent: parseFloat(hum.toFixed(2)),
        battery_voltage: 4.12,
        rssi: -60 - Math.floor(Math.random() * 10),
      };

      try {
        const res = await postTelemetry(INGEST_URL, device.id, device.secret, payload);
        if (res.status === 201) {
          const body = res.body as { computed_moisture_percent: number };
          console.log(
            `[${nowStr}] [${green('201 OK')}] ${bold(device.name)} -> ` +
              `Soil: ${cyan(`${body.computed_moisture_percent}%`)} (raw: ${rawSoil}) | ` +
              `Temp: ${yellow(`${payload.temperature_c}°C`)} | ` +
              `Hum: ${cyan(`${payload.humidity_percent}%`)}`
          );
        } else if (res.status === 429) {
          console.log(
            `[${nowStr}] [${yellow('429 RATE LIMIT')}] ${device.name}: Next retry permitted in 15s.`
          );
        } else {
          console.log(
            `[${nowStr}] [${red(`${res.status} ERR`)}] ${device.name}: ${JSON.stringify(res.body)}`
          );
        }
      } catch (err: unknown) {
        console.log(
          `[${nowStr}] [${red('NETWORK ERR')}] ${device.name}: ${(err as Error).message}`
        );
      }
    }
  }

  // Initial report
  await tick();
  // Loop
  setInterval(tick, STREAM_INTERVAL_SEC * 1000);
}

// Execution Entry Point
if (isTestMode) {
  runComplianceTests().catch(console.error);
} else {
  startStreaming().catch(console.error);
}
