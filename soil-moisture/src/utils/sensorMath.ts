/**
 * Pure functions for sensor telemetry, calibration, gauge math, and status evaluation
 */

export function convertCelsiusToFahrenheit(celsius: number): number {
  if (celsius == null || isNaN(celsius) || !isFinite(celsius)) return 32;
  return Number(((celsius * 9) / 5 + 32).toFixed(1));
}

export function formatTemperature(celsius: number | null | undefined, unit: 'C' | 'F'): string {
  if (celsius == null || isNaN(celsius) || !isFinite(celsius)) {
    return '--';
  }
  if (unit === 'F') {
    return `${convertCelsiusToFahrenheit(celsius)}°F`;
  }
  const rounded = Math.round((celsius + Number.EPSILON) * 10) / 10;
  return `${rounded.toFixed(1)}°C`;
}

/**
 * Validates whether a sensor reading value is a valid, finite number
 */
export function isValidReading(value: unknown): value is number {
  return value !== null && value !== undefined && typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * Sanitizes a reading value to either a valid number or null
 */
export function sanitizeReading(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'number' ? value : Number(value);
  return !isNaN(num) && isFinite(num) ? num : null;
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
  if (!isValidReading(rawAdc)) return 0;
  if (airAdc === waterAdc) return 50;
  
  // Guarantee dry > wet orientation
  const dry = Math.max(airAdc, waterAdc);
  const wet = Math.min(airAdc, waterAdc);

  const percentage = ((dry - rawAdc) / (dry - wet)) * 100;
  return Math.min(100, Math.max(0, Math.round(percentage * 10) / 10));
}

export type HealthStatus = 'healthy' | 'warning' | 'danger';

export function determinePlantHealthStatus(
  moisture: number,
  minThreshold: number,
  maxThreshold: number
): HealthStatus {
  if (!isValidReading(moisture)) return 'danger';
  if (moisture < minThreshold - 10 || moisture > maxThreshold + 15) {
    return 'danger';
  }
  if (moisture < minThreshold || moisture > maxThreshold) {
    return 'warning';
  }
  return 'healthy';
}

/**
 * Calculates speedometer dial needle angle in degrees for a given sensor value
 */
export function calculateGaugeAngle(
  value: number | null,
  minValue: number,
  maxValue: number,
  startAngle: number = 150,
  sweepAngle: number = 240
): number {
  if (value === null || !isValidReading(value)) {
    return startAngle;
  }
  const range = maxValue - minValue;
  if (range <= 0) return startAngle;
  const fraction = Math.max(0, Math.min(1, (value - minValue) / range));
  return startAngle + fraction * sweepAngle;
}

/**
 * Determines which color zone a value falls into (normal, warning, critical, disconnected)
 */
export type GaugeZone =
  | 'optimal'
  | 'warning_low'
  | 'warning_high'
  | 'critical_low'
  | 'critical_high'
  | 'disconnected';

export function getGaugeColorZone(
  value: number | null,
  minTarget: number,
  maxTarget: number,
  criticalDelta: number = 10
): GaugeZone {
  if (value === null || !isValidReading(value)) {
    return 'disconnected';
  }
  if (value < minTarget - criticalDelta) {
    return 'critical_low';
  }
  if (value < minTarget) {
    return 'warning_low';
  }
  if (value > maxTarget + criticalDelta) {
    return 'critical_high';
  }
  if (value > maxTarget) {
    return 'warning_high';
  }
  return 'optimal';
}

/**
 * Generates an SVG path data string for a circular arc segment
 */
export function describeSvgArc(
  cx: number,
  cy: number,
  radius: number,
  startAngleDeg: number,
  endAngleDeg: number
): string {
  // Convert degrees to radians
  const startRad = (startAngleDeg * Math.PI) / 180;
  const endRad = (endAngleDeg * Math.PI) / 180;

  const startX = cx + radius * Math.cos(startRad);
  const startY = cy + radius * Math.sin(startRad);
  const endX = cx + radius * Math.cos(endRad);
  const endY = cy + radius * Math.sin(endRad);

  const angleDiff = endAngleDeg - startAngleDeg;
  const largeArcFlag = angleDiff > 180 ? 1 : 0;
  const sweepFlag = 1; // Clockwise

  return `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${endX} ${endY}`;
}

/**
 * Removes duplicate telemetry records and sorts chronologically
 */
export function deduplicateTelemetryReadings<
  T extends { timestamp?: string; recorded_at?: string; bucket_start?: string }
>(records: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const record of records) {
    const timeKey = record.timestamp || record.recorded_at || record.bucket_start;
    if (timeKey && !seen.has(timeKey)) {
      seen.add(timeKey);
      unique.push(record);
    }
  }

  return unique.sort((a, b) => {
    const timeA = new Date(a.timestamp || a.recorded_at || a.bucket_start || 0).getTime();
    const timeB = new Date(b.timestamp || b.recorded_at || b.bucket_start || 0).getTime();
    return timeA - timeB;
  });
}
