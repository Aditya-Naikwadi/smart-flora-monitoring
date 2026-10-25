import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Pure math & sensor functions under test
function convertCelsiusToFahrenheit(celsius) {
  if (celsius == null || isNaN(celsius) || !isFinite(celsius)) return 32;
  return Number(((celsius * 9) / 5 + 32).toFixed(1));
}

function formatTemperature(celsius, unit) {
  if (celsius == null || isNaN(celsius) || !isFinite(celsius)) {
    return '--';
  }
  if (unit === 'F') {
    return `${convertCelsiusToFahrenheit(celsius)}°F`;
  }
  const rounded = Math.round((celsius + Number.EPSILON) * 10) / 10;
  return `${rounded.toFixed(1)}°C`;
}

function isValidReading(value) {
  return value !== null && value !== undefined && typeof value === 'number' && !isNaN(value) && isFinite(value);
}

function sanitizeReading(value) {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'number' ? value : Number(value);
  return !isNaN(num) && isFinite(num) ? num : null;
}

function calculateMoisturePercentage(rawAdc, airAdc = 3200, waterAdc = 1400) {
  if (!isValidReading(rawAdc)) return 0;
  if (airAdc === waterAdc) return 50;
  const dry = Math.max(airAdc, waterAdc);
  const wet = Math.min(airAdc, waterAdc);
  const percentage = ((dry - rawAdc) / (dry - wet)) * 100;
  return Math.min(100, Math.max(0, Math.round(percentage * 10) / 10));
}

function determinePlantHealthStatus(moisture, minThreshold, maxThreshold) {
  if (!isValidReading(moisture)) return 'danger';
  if (moisture < minThreshold - 10 || moisture > maxThreshold + 15) {
    return 'danger';
  }
  if (moisture < minThreshold || moisture > maxThreshold) {
    return 'warning';
  }
  return 'healthy';
}

function calculateGaugeAngle(value, minValue, maxValue, startAngle = 150, sweepAngle = 240) {
  if (value === null || !isValidReading(value)) {
    return startAngle;
  }
  const range = maxValue - minValue;
  if (range <= 0) return startAngle;
  const fraction = Math.max(0, Math.min(1, (value - minValue) / range));
  return startAngle + fraction * sweepAngle;
}

function getGaugeColorZone(value, minTarget, maxTarget, criticalDelta = 10) {
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

function describeSvgArc(cx, cy, radius, startAngleDeg, endAngleDeg) {
  const startRad = (startAngleDeg * Math.PI) / 180;
  const endRad = (endAngleDeg * Math.PI) / 180;
  const startX = cx + radius * Math.cos(startRad);
  const startY = cy + radius * Math.sin(startRad);
  const endX = cx + radius * Math.cos(endRad);
  const endY = cy + radius * Math.sin(endRad);
  const angleDiff = endAngleDeg - startAngleDeg;
  const largeArcFlag = angleDiff > 180 ? 1 : 0;
  const sweepFlag = 1;
  return `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${endX} ${endY}`;
}

function deduplicateTelemetryReadings(records) {
  const seen = new Set();
  const unique = [];
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

function calculatePlantHealth(plant, device, latestReading) {
  if (!device || !device.last_seen) {
    return 'offline';
  }
  const reportingInterval = device.reporting_interval_seconds || 300;
  const offlineThresholdMs = Math.max(reportingInterval * 3 * 1000, 15 * 60 * 1000);
  const timeSinceLastSeen = Date.now() - new Date(device.last_seen).getTime();

  if (isNaN(timeSinceLastSeen) || timeSinceLastSeen > offlineThresholdMs) {
    return 'offline';
  }
  if (!latestReading) {
    return 'healthy';
  }

  const moisture = Number(latestReading.soil_moisture_percent);
  const temp = Number(latestReading.temperature_c);

  if (isNaN(moisture) || isNaN(temp)) {
    return 'offline';
  }

  if (moisture < plant.min_soil_moisture) return 'needs_water';
  if (moisture > plant.max_soil_moisture) return 'overwatered';
  if (temp > plant.max_temperature_c) return 'too_hot';
  if (temp < plant.min_temperature_c) return 'too_cold';

  return 'healthy';
}

describe('Sensor Math, Calibration & Unit Conversion', () => {
  it('converts 0°C to 32°F', () => {
    assert.equal(convertCelsiusToFahrenheit(0), 32);
  });

  it('converts 25°C room temperature to 77°F', () => {
    assert.equal(convertCelsiusToFahrenheit(25), 77);
  });

  it('converts 100°C boiling point to 212°F', () => {
    assert.equal(convertCelsiusToFahrenheit(100), 212);
  });

  it('converts negative temperatures accurately (-15°C to 5°F)', () => {
    assert.equal(convertCelsiusToFahrenheit(-15), 5);
  });

  it('handles null and NaN safely in temperature conversions', () => {
    assert.equal(convertCelsiusToFahrenheit(null), 32);
    assert.equal(convertCelsiusToFahrenheit(NaN), 32);
    assert.equal(formatTemperature(null, 'C'), '--');
    assert.equal(formatTemperature(undefined, 'F'), '--');
    assert.equal(formatTemperature(NaN, 'C'), '--');
  });

  it('formats temperature strings accurately for C and F', () => {
    assert.equal(formatTemperature(22.45, 'C'), '22.5°C');
    assert.equal(formatTemperature(25, 'F'), '77°F');
  });

  it('calculates 0% moisture when raw ADC matches air reading', () => {
    assert.equal(calculateMoisturePercentage(3200, 3200, 1400), 0);
  });

  it('calculates 100% moisture when raw ADC matches water reading', () => {
    assert.equal(calculateMoisturePercentage(1400, 3200, 1400), 100);
  });

  it('clamps values when sensor is in ultra-dry or saturated conditions', () => {
    assert.equal(calculateMoisturePercentage(3500, 3200, 1400), 0);
    assert.equal(calculateMoisturePercentage(1000, 3200, 1400), 100);
  });

  it('calculates accurate midpoint moisture', () => {
    assert.equal(calculateMoisturePercentage(2300, 3200, 1400), 50);
  });

  it('evaluates plant health status correctly according to configured thresholds', () => {
    const minMoist = 30;
    const maxMoist = 70;

    assert.equal(determinePlantHealthStatus(50, minMoist, maxMoist), 'healthy');
    assert.equal(determinePlantHealthStatus(25, minMoist, maxMoist), 'warning');
    assert.equal(determinePlantHealthStatus(15, minMoist, maxMoist), 'danger');
    assert.equal(determinePlantHealthStatus(75, minMoist, maxMoist), 'warning');
    assert.equal(determinePlantHealthStatus(90, minMoist, maxMoist), 'danger');
  });
});

describe('Speedometer Gauge Dial Geometry & Color Zones', () => {
  it('calculates needle angle at start of dial (minimum value)', () => {
    // Range 0 - 100, Start Angle 150°, Sweep 240°
    const angle = calculateGaugeAngle(0, 0, 100, 150, 240);
    assert.equal(angle, 150);
  });

  it('calculates needle angle at top dead center (midpoint value)', () => {
    // 50% on 150° + 240° sweep should point to 270° (straight up)
    const angle = calculateGaugeAngle(50, 0, 100, 150, 240);
    assert.equal(angle, 270);
  });

  it('calculates needle angle at end of dial (maximum value)', () => {
    // 100% should point to 150 + 240 = 390°
    const angle = calculateGaugeAngle(100, 0, 100, 150, 240);
    assert.equal(angle, 390);
  });

  it('clamps needle angles for out-of-bounds sensor values', () => {
    assert.equal(calculateGaugeAngle(-20, 0, 100, 150, 240), 150);
    assert.equal(calculateGaugeAngle(150, 0, 100, 150, 240), 390);
  });

  it('parks needle safely at startAngle when reading is null or NaN (disconnected)', () => {
    assert.equal(calculateGaugeAngle(null, 0, 100, 150, 240), 150);
    assert.equal(calculateGaugeAngle(NaN, 0, 100, 150, 240), 150);
  });

  it('identifies color zones correctly (optimal, warning, critical, disconnected)', () => {
    const minTarget = 30;
    const maxTarget = 80;

    // Disconnected
    assert.equal(getGaugeColorZone(null, minTarget, maxTarget), 'disconnected');
    assert.equal(getGaugeColorZone(NaN, minTarget, maxTarget), 'disconnected');

    // Optimal
    assert.equal(getGaugeColorZone(55, minTarget, maxTarget), 'optimal');
    assert.equal(getGaugeColorZone(30, minTarget, maxTarget), 'optimal');
    assert.equal(getGaugeColorZone(80, minTarget, maxTarget), 'optimal');

    // Warning low (20 - 29)
    assert.equal(getGaugeColorZone(25, minTarget, maxTarget), 'warning_low');

    // Critical low (< 20)
    assert.equal(getGaugeColorZone(15, minTarget, maxTarget), 'critical_low');

    // Warning high (81 - 90)
    assert.equal(getGaugeColorZone(85, minTarget, maxTarget), 'warning_high');

    // Critical high (> 90)
    assert.equal(getGaugeColorZone(95, minTarget, maxTarget), 'critical_high');
  });

  it('generates valid SVG arc path strings with correct flags', () => {
    // Sub-180 degree arc: largeArcFlag should be 0
    const arcShort = describeSvgArc(130, 125, 80, 150, 270);
    assert.match(arcShort, /^M \d+[\.\d]* \d+[\.\d]* A 80 80 0 0 1 \d+[\.\d]* \d+[\.\d]*$/);

    // Greater than 180 degree arc: largeArcFlag should be 1
    const arcFull = describeSvgArc(130, 125, 80, 150, 390);
    assert.match(arcFull, /^M \d+[\.\d]* \d+[\.\d]* A 80 80 0 1 1 \d+[\.\d]* \d+[\.\d]*$/);
  });
});

describe('Telemetry Deduplication & Sensor Disconnect Handling', () => {
  it('deduplicates identical timestamp records and maintains chronological order', () => {
    const records = [
      { timestamp: '2026-10-25T10:00:00Z', moisture: 40 },
      { timestamp: '2026-10-25T10:30:00Z', moisture: 42 },
      { timestamp: '2026-10-25T10:00:00Z', moisture: 40 }, // duplicate
      { timestamp: '2026-10-25T09:30:00Z', moisture: 38 }, // earlier out-of-order
    ];

    const deduplicated = deduplicateTelemetryReadings(records);
    assert.equal(deduplicated.length, 3);
    assert.equal(deduplicated[0].timestamp, '2026-10-25T09:30:00Z');
    assert.equal(deduplicated[1].timestamp, '2026-10-25T10:00:00Z');
    assert.equal(deduplicated[2].timestamp, '2026-10-25T10:30:00Z');
  });

  it('sanitizes valid and invalid reading values safely', () => {
    assert.equal(isValidReading(42.5), true);
    assert.equal(isValidReading(0), true);
    assert.equal(isValidReading(null), false);
    assert.equal(isValidReading(undefined), false);
    assert.equal(isValidReading(NaN), false);
    assert.equal(isValidReading(Infinity), false);
    assert.equal(isValidReading('50'), false);

    assert.equal(sanitizeReading(42.5), 42.5);
    assert.equal(sanitizeReading('65.2'), 65.2);
    assert.equal(sanitizeReading(null), null);
    assert.equal(sanitizeReading(undefined), null);
    assert.equal(sanitizeReading('invalid'), null);
  });

  it('evaluates device offline status when heartbeat threshold is exceeded', () => {
    const plant = {
      min_soil_moisture: 30,
      max_soil_moisture: 80,
      min_temperature_c: 15,
      max_temperature_c: 35,
    };

    const reading = {
      soil_moisture_percent: 50,
      temperature_c: 24,
    };

    // 1. Device with no last_seen -> offline
    assert.equal(calculatePlantHealth(plant, null, reading), 'offline');
    assert.equal(calculatePlantHealth(plant, { last_seen: null }, reading), 'offline');

    // 2. Device seen recently (1 min ago) -> healthy
    const recentSeen = new Date(Date.now() - 60 * 1000).toISOString();
    assert.equal(
      calculatePlantHealth(
        plant,
        { last_seen: recentSeen, reporting_interval_seconds: 300 },
        reading
      ),
      'healthy'
    );

    // 3. Device seen 30 mins ago (> 15 min offline threshold) -> offline
    const oldSeen = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    assert.equal(
      calculatePlantHealth(
        plant,
        { last_seen: oldSeen, reporting_interval_seconds: 300 },
        reading
      ),
      'offline'
    );
  });
});
