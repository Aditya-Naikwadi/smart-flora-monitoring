import {
  AlertLevel,
  SensorThresholdConfig,
  SensorType,
} from '@/config/thresholdsConfig';

export interface EvaluationResult {
  sensorType: SensorType;
  value: number;
  level: AlertLevel;
  title: string;
  message: string;
  action: string;
  isProblem: boolean;
  isCritical: boolean;
}

/**
 * Pure evaluation function that assesses a sensor reading against crop thresholds
 * with hysteresis support to eliminate oscillation/flapping around boundary edges.
 *
 * @param sensorType 'moisture' | 'temperature' | 'humidity'
 * @param value Raw numerical sensor readout
 * @param config Thresholds & hysteresis configuration for this sensor
 * @param previousLevel The level from the previous evaluation cycle (for hysteresis)
 */
export function evaluate(
  sensorType: SensorType,
  value: number | null | undefined,
  config: SensorThresholdConfig,
  previousLevel?: AlertLevel
): EvaluationResult {
  // 1. Physical Validity Check (Ignore null, NaN, or out-of-physical-range noise)
  if (
    value === null ||
    value === undefined ||
    typeof value !== 'number' ||
    isNaN(value) ||
    !isFinite(value) ||
    value < config.physicalMin ||
    value > config.physicalMax
  ) {
    return {
      sensorType,
      value: Number.NaN,
      level: 'invalid',
      title: `⚠️ ${config.label} Reading Invalid`,
      message: 'Sensor reading is missing, corrupt, or outside physical sensor bounds.',
      action: 'Inspect probe wiring, ADC attenuation, and ESP32 pin power.',
      isProblem: true,
      isCritical: false,
    };
  }

  // 2. Raw Level Assessment
  let calculatedLevel: AlertLevel = 'ok';

  if (value < config.criticalLow) {
    calculatedLevel = 'criticalLow';
  } else if (value < config.low) {
    calculatedLevel = 'low';
  } else if (value > config.criticalHigh) {
    calculatedLevel = 'criticalHigh';
  } else if (value > config.highStart) {
    calculatedLevel = 'high';
  } else {
    // Value falls within the nominal band [low, highStart].
    // Apply HYSTERESIS:
    // If previously in a sub-optimal/low state, require value to penetrate
    // the safe boundary by `hysteresisMargin` before clearing the alert.
    if (previousLevel === 'criticalLow' || previousLevel === 'low') {
      const clearThreshold = config.low + config.hysteresisMargin;
      if (value < clearThreshold) {
        calculatedLevel = 'low'; // Maintain alert until clear margin is exceeded
      } else {
        calculatedLevel = 'ok';
      }
    } else if (previousLevel === 'criticalHigh' || previousLevel === 'high') {
      const clearThreshold = config.highStart - config.hysteresisMargin;
      if (value > clearThreshold) {
        calculatedLevel = 'high'; // Maintain alert until clear margin is penetrated
      } else {
        calculatedLevel = 'ok';
      }
    } else {
      calculatedLevel = 'ok';
    }
  }

  // 3. Assemble Title, Action, and Message
  const formattedVal = Number.isInteger(value) ? `${value}` : value.toFixed(1);
  let title = '';
  let message = '';
  let action = '';

  switch (calculatedLevel) {
    case 'criticalLow':
      title = `🔴 ${config.label} critically low (${formattedVal}${config.unit})`;
      message = config.messages.criticalLow;
      action = config.actions.criticalLow;
      break;

    case 'low':
      title = `🟠 ${config.label} low (${formattedVal}${config.unit})`;
      message = config.messages.low;
      action = config.actions.low;
      break;

    case 'high':
      title = `🟠 ${config.label} high (${formattedVal}${config.unit})`;
      message = config.messages.high;
      action = config.actions.high;
      break;

    case 'criticalHigh':
      title = `🔴 ${config.label} critically high (${formattedVal}${config.unit})`;
      message = config.messages.criticalHigh;
      action = config.actions.criticalHigh;
      break;

    case 'ok':
    default:
      title = `🟢 ${config.label} optimal (${formattedVal}${config.unit})`;
      message = `Sensor is operating within the ideal agricultural comfort band (${config.optimalMin}-${config.optimalMax}${config.unit}).`;
      action = 'Conditions are optimal. No manual intervention required.';
      break;
  }

  return {
    sensorType,
    value,
    level: calculatedLevel,
    title,
    message,
    action,
    isProblem: calculatedLevel !== 'ok',
    isCritical: calculatedLevel === 'criticalLow' || calculatedLevel === 'criticalHigh',
  };
}

/**
 * Generates a Recovery notification payload when returning to optimal conditions
 */
export function buildRecoveryAlert(
  sensorType: SensorType,
  value: number,
  config: SensorThresholdConfig
): { title: string; message: string; action: string } {
  const formattedVal = Number.isInteger(value) ? `${value}` : value.toFixed(1);
  return {
    title: `🟢 ${config.label} recovered to optimal (${formattedVal}${config.unit})`,
    message: config.messages.recovery,
    action: config.actions.recovery,
  };
}

/**
 * Generates a Sensor Offline notification payload when no telemetry has arrived
 */
export function buildOfflineAlert(
  sensorType: SensorType,
  minutesOffline: number,
  config: SensorThresholdConfig
): { title: string; message: string; action: string } {
  return {
    title: `⚠️ ${config.label} sensor offline (${minutesOffline}m silent)`,
    message: config.messages.offline,
    action: config.actions.offline,
  };
}
