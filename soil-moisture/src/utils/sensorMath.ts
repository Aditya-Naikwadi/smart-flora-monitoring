/**
 * Pure functions for sensor telemetry, calibration, and status evaluation
 */

export function convertCelsiusToFahrenheit(celsius: number): number {
  return Number(((celsius * 9) / 5 + 32).toFixed(1));
}

export function formatTemperature(celsius: number, unit: 'C' | 'F'): string {
  if (unit === 'F') {
    return `${convertCelsiusToFahrenheit(celsius)}°F`;
  }
  const rounded = Math.round((celsius + Number.EPSILON) * 10) / 10;
  return `${rounded}°C`;
}

/**
 * Calibrates raw ADC value from capacitive soil sensor to 0 - 100%
 * Capacitive sensors read HIGHER ADC in air (dry) and LOWER ADC in water (wet).
 */
export function calculateMoisturePercentage(
  rawAdc: number,
  airAdc: number = 3200,
  waterAdc: number = 1400
): number {
  if (airAdc === waterAdc) return 50;
  // If sensor is in air (raw >= airAdc) -> 0%
  // If sensor is in water (raw <= waterAdc) -> 100%
  const percentage = ((airAdc - rawAdc) / (airAdc - waterAdc)) * 100;
  return Math.min(100, Math.max(0, Math.round(percentage * 10) / 10));
}

export type HealthStatus = 'healthy' | 'warning' | 'danger';

export function determinePlantHealthStatus(
  moisture: number,
  minThreshold: number,
  maxThreshold: number
): HealthStatus {
  if (moisture < minThreshold - 10 || moisture > maxThreshold + 15) {
    return 'danger';
  }
  if (moisture < minThreshold || moisture > maxThreshold) {
    return 'warning';
  }
  return 'healthy';
}
