import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

// 1. Auth Schemas
const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const registerSchema = z
  .object({
    fullName: z.string().min(2, 'Full name must be at least 2 characters'),
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// 2. Thresholds Configuration Schema
const plantThresholdsSchema = z
  .object({
    min_moisture: z.number().min(0).max(100),
    max_moisture: z.number().min(0).max(100),
    min_temperature: z.number().min(-20).max(60),
    max_temperature: z.number().min(-20).max(60),
    min_humidity: z.number().min(0).max(100),
    max_humidity: z.number().min(0).max(100),
    alert_cooldown_minutes: z.number().min(5).max(1440),
  })
  .refine((data) => data.min_moisture < data.max_moisture, {
    message: 'Minimum moisture must be strictly less than maximum moisture',
  })
  .refine((data) => data.min_temperature < data.max_temperature, {
    message: 'Minimum temperature must be strictly less than maximum temperature',
  })
  .refine((data) => data.min_humidity < data.max_humidity, {
    message: 'Minimum humidity must be strictly less than maximum humidity',
  });

// 3. IoT Sensor Telemetry Ingest Payload Schema (ESP32)
const telemetryPayloadSchema = z.object({
  soil_moisture_raw: z
    .number()
    .int()
    .min(0, '12-bit ADC min is 0')
    .max(4095, '12-bit ADC max is 4095'),
  temperature_c: z
    .number()
    .min(-40, 'Temperature below sensor range')
    .max(80, 'Temperature above sensor range'),
  humidity_percent: z
    .number()
    .min(0, 'Humidity cannot be negative')
    .max(100, 'Humidity cannot exceed 100%'),
  battery_voltage: z.number().min(0).max(10).optional(),
  rssi: z.number().int().min(-120).max(0).optional(),
});

// 4. Device Ingest Headers Schema
const ingestHeadersSchema = z.object({
  'x-device-id': z.string().uuid('Device ID must be a UUID'),
  'x-device-secret': z.string().min(16, 'Secret must be at least 16 characters'),
});

describe('User Authentication & Account Schemas', () => {
  it('accepts valid login credentials', () => {
    const valid = loginSchema.safeParse({
      email: 'botanist@smartflora.io',
      password: 'password123',
    });
    assert.equal(valid.success, true);
  });

  it('rejects malformed email address', () => {
    const invalid = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'password123',
    });
    assert.equal(invalid.success, false);
  });

  it('rejects passwords shorter than 6 characters', () => {
    const invalid = loginSchema.safeParse({
      email: 'botanist@smartflora.io',
      password: '123',
    });
    assert.equal(invalid.success, false);
  });

  it('validates matching registration passwords', () => {
    const valid = registerSchema.safeParse({
      fullName: 'Alice Botanist',
      email: 'alice@flora.io',
      password: 'mypassword123',
      confirmPassword: 'mypassword123',
    });
    assert.equal(valid.success, true);
  });

  it('rejects mismatched registration passwords', () => {
    const invalid = registerSchema.safeParse({
      fullName: 'Alice Botanist',
      email: 'alice@flora.io',
      password: 'mypassword123',
      confirmPassword: 'differentpassword',
    });
    assert.equal(invalid.success, false);
  });
});

describe('Plant Target Thresholds Validation', () => {
  it('validates compliant plant moisture, temperature & humidity thresholds', () => {
    const valid = plantThresholdsSchema.safeParse({
      min_moisture: 30,
      max_moisture: 65,
      min_temperature: 18,
      max_temperature: 30,
      min_humidity: 40,
      max_humidity: 80,
      alert_cooldown_minutes: 60,
    });
    assert.equal(valid.success, true);
  });

  it('rejects thresholds where minimum is greater than maximum', () => {
    const invertedMoisture = plantThresholdsSchema.safeParse({
      min_moisture: 70,
      max_moisture: 30,
      min_temperature: 18,
      max_temperature: 30,
      min_humidity: 40,
      max_humidity: 80,
      alert_cooldown_minutes: 60,
    });
    assert.equal(invertedMoisture.success, false);

    const invertedTemp = plantThresholdsSchema.safeParse({
      min_moisture: 30,
      max_moisture: 70,
      min_temperature: 35,
      max_temperature: 20,
      min_humidity: 40,
      max_humidity: 80,
      alert_cooldown_minutes: 60,
    });
    assert.equal(invertedTemp.success, false);
  });

  it('rejects cooldown outside allowed 5m - 24h range', () => {
    const tooFast = plantThresholdsSchema.safeParse({
      min_moisture: 30,
      max_moisture: 70,
      min_temperature: 18,
      max_temperature: 28,
      min_humidity: 40,
      max_humidity: 80,
      alert_cooldown_minutes: 2, // below 5
    });
    assert.equal(tooFast.success, false);
  });
});

describe('IoT Sensor Ingest Payload & Security Headers', () => {
  it('accepts valid ESP32 sensor telemetry payload', () => {
    const valid = telemetryPayloadSchema.safeParse({
      soil_moisture_raw: 2150,
      temperature_c: 24.3,
      humidity_percent: 62.1,
      battery_voltage: 4.15,
      rssi: -65,
    });
    assert.equal(valid.success, true);
  });

  it('rejects out-of-range ADC reading (> 4095 for 12-bit ADC)', () => {
    const invalid = telemetryPayloadSchema.safeParse({
      soil_moisture_raw: 5000,
      temperature_c: 24.3,
      humidity_percent: 62.1,
    });
    assert.equal(invalid.success, false);
  });

  it('rejects physically impossible temperatures (> 80°C)', () => {
    const invalid = telemetryPayloadSchema.safeParse({
      soil_moisture_raw: 2150,
      temperature_c: 120.0,
      humidity_percent: 62.1,
    });
    assert.equal(invalid.success, false);
  });

  it('rejects negative humidity percentage', () => {
    const invalid = telemetryPayloadSchema.safeParse({
      soil_moisture_raw: 2150,
      temperature_c: 24.3,
      humidity_percent: -5,
    });
    assert.equal(invalid.success, false);
  });

  it('validates device authentication headers', () => {
    const valid = ingestHeadersSchema.safeParse({
      'x-device-id': '11111111-1111-4111-a111-111111111111',
      'x-device-secret': 'sec_1234567890abcdef123456',
    });
    assert.equal(valid.success, true);
  });

  it('rejects invalid device UUID header', () => {
    const invalid = ingestHeadersSchema.safeParse({
      'x-device-id': 'not-a-uuid',
      'x-device-secret': 'sec_1234567890abcdef123456',
    });
    assert.equal(invalid.success, false);
  });
});
