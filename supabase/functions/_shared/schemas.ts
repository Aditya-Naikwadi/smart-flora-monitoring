import { z } from 'npm:zod@3.24.1';

/**
 * Zod schema for telemetry payload sent by ESP32 microcontrollers
 */
export const TelemetryPayloadSchema = z.object({
  // Raw 12-bit ADC reading from capacitive soil moisture sensor (0-4095)
  soil_moisture_raw: z
    .number()
    .int('Raw soil moisture ADC reading must be an integer')
    .min(0, 'Raw ADC reading cannot be negative')
    .max(4095, '12-bit ADC max is 4095'),

  // Ambient temperature in Celsius from DHT11/DHT22 (-40°C to +80°C)
  temperature_c: z
    .number()
    .min(-40, 'Temperature is below physical sensor minimum (-40°C)')
    .max(80, 'Temperature exceeds physical sensor maximum (80°C)'),

  // Relative humidity percent from DHT11/DHT22 (0% to 100%)
  humidity_percent: z
    .number()
    .min(0, 'Relative humidity cannot be below 0%')
    .max(100, 'Relative humidity cannot exceed 100%'),

  // Optional battery voltage (e.g., 3.0V to 4.3V for LiPo / 18650 cells)
  battery_voltage: z
    .number()
    .min(0, 'Battery voltage cannot be negative')
    .max(10, 'Battery voltage exceeds expected range')
    .optional(),

  // Optional WiFi RSSI signal strength (-120 dBm to 0 dBm)
  rssi: z
    .number()
    .int('RSSI must be an integer dBm value')
    .min(-120, 'Signal strength too low')
    .max(0, 'Signal strength cannot exceed 0 dBm')
    .optional(),
});

export type TelemetryPayload = z.infer<typeof TelemetryPayloadSchema>;

/**
 * Zod schema for required authentication headers
 */
export const IngestHeadersSchema = z.object({
  'x-device-id': z.string().uuid('x-device-id header must be a valid UUID'),
  'x-device-secret': z.string().min(16, 'x-device-secret header is required and must be at least 16 characters'),
});
