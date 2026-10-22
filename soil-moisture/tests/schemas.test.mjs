import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const plantThresholdsSchema = z
  .object({
    min_moisture: z.number().min(0).max(100),
    max_moisture: z.number().min(0).max(100),
    min_temperature: z.number().min(-10).max(50),
    max_temperature: z.number().min(-10).max(50),
  })
  .refine((data) => data.min_moisture < data.max_moisture, {
    message: 'Minimum moisture must be strictly less than maximum moisture',
  })
  .refine((data) => data.min_temperature < data.max_temperature, {
    message: 'Minimum temperature must be strictly less than maximum temperature',
  });

describe('Zod Validation Schemas', () => {
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

  it('validates compliant plant moisture & temperature thresholds', () => {
    const valid = plantThresholdsSchema.safeParse({
      min_moisture: 30,
      max_moisture: 65,
      min_temperature: 18,
      max_temperature: 30,
    });
    assert.equal(valid.success, true);
  });

  it('rejects thresholds where minimum is greater than maximum', () => {
    const invertedMoisture = plantThresholdsSchema.safeParse({
      min_moisture: 70,
      max_moisture: 30,
      min_temperature: 18,
      max_temperature: 30,
    });
    assert.equal(invertedMoisture.success, false);

    const invertedTemp = plantThresholdsSchema.safeParse({
      min_moisture: 30,
      max_moisture: 70,
      min_temperature: 35,
      max_temperature: 20,
    });
    assert.equal(invertedTemp.success, false);
  });
});
