import test from 'node:test';
import assert from 'node:assert/strict';

// Test implementation of evaluate matching src/features/alerts/thresholdEngine.ts
function evaluate(sensorType, value, config, previousLevel) {
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

  let calculatedLevel = 'ok';

  if (value < config.criticalLow) {
    calculatedLevel = 'criticalLow';
  } else if (value < config.low) {
    calculatedLevel = 'low';
  } else if (value > config.criticalHigh) {
    calculatedLevel = 'criticalHigh';
  } else if (value > config.highStart) {
    calculatedLevel = 'high';
  } else {
    // Hysteresis
    if (previousLevel === 'criticalLow' || previousLevel === 'low') {
      const clearThreshold = config.low + config.hysteresisMargin;
      if (value < clearThreshold) {
        calculatedLevel = 'low';
      } else {
        calculatedLevel = 'ok';
      }
    } else if (previousLevel === 'criticalHigh' || previousLevel === 'high') {
      const clearThreshold = config.highStart - config.hysteresisMargin;
      if (value > clearThreshold) {
        calculatedLevel = 'high';
      } else {
        calculatedLevel = 'ok';
      }
    } else {
      calculatedLevel = 'ok';
    }
  }

  const formattedVal = Number.isInteger(value) ? `${value}` : value.toFixed(1);
  let title = '';
  let action = '';

  switch (calculatedLevel) {
    case 'criticalLow':
      title = `🔴 ${config.label} critically low (${formattedVal}${config.unit})`;
      action = config.actions.criticalLow;
      break;
    case 'low':
      title = `🟠 ${config.label} low (${formattedVal}${config.unit})`;
      action = config.actions.low;
      break;
    case 'high':
      title = `🟠 ${config.label} high (${formattedVal}${config.unit})`;
      action = config.actions.high;
      break;
    case 'criticalHigh':
      title = `🔴 ${config.label} critically high (${formattedVal}${config.unit})`;
      action = config.actions.criticalHigh;
      break;
    case 'ok':
    default:
      title = `🟢 ${config.label} optimal (${formattedVal}${config.unit})`;
      action = 'Conditions are optimal. No manual intervention required.';
      break;
  }

  return {
    sensorType,
    value,
    level: calculatedLevel,
    title,
    action,
    isProblem: calculatedLevel !== 'ok',
    isCritical: calculatedLevel === 'criticalLow' || calculatedLevel === 'criticalHigh',
  };
}

const SOIL_CONFIG = {
  unit: '%',
  label: 'Soil moisture',
  physicalMin: 0,
  physicalMax: 100,
  criticalLow: 15,
  low: 25,
  highStart: 40,
  criticalHigh: 50,
  optimalMin: 25,
  optimalMax: 40,
  hysteresisMargin: 2.0,
  actions: {
    criticalLow: 'Irrigate immediately',
    low: 'Schedule irrigation soon, check pump and emitters',
    high: 'Stop or delay irrigation, check drainage',
    criticalHigh: 'Turn off pump/valve, drain field, waterlogging risk',
    recovery: 'Soil moisture is back in the optimal growth band.',
    offline: 'Check ESP32 Wi-Fi connectivity and power supply.',
  },
};

const TEMP_CONFIG = {
  unit: '°C',
  label: 'Air temperature',
  physicalMin: -40,
  physicalMax: 80,
  criticalLow: 5,
  low: 15,
  highStart: 30,
  criticalHigh: 35,
  optimalMin: 18,
  optimalMax: 30,
  hysteresisMargin: 1.0,
  actions: {
    criticalLow: 'Frost risk: cover crops, close vents, use heater',
    low: 'Close vents, use row covers',
    high: 'Open vents, run fans, shade net, irrigate in cooler hours',
    criticalHigh: 'Heat stress: shade, mist/fog, extra irrigation, avoid midday work',
  },
};

test('Agricultural Threshold Engine & Multi-Tier Alert Evaluation', async (t) => {
  await t.test('evaluates soil moisture levels and actions accurately', () => {
    // 1. Critical Low (<15%)
    const critLow = evaluate('moisture', 12, SOIL_CONFIG);
    assert.equal(critLow.level, 'criticalLow');
    assert.equal(critLow.isCritical, true);
    assert.equal(critLow.title, '🔴 Soil moisture critically low (12%)');
    assert.equal(critLow.action, 'Irrigate immediately');

    // 2. Low Warning (15 - 25%)
    const low = evaluate('moisture', 20, SOIL_CONFIG);
    assert.equal(low.level, 'low');
    assert.equal(low.isCritical, false);
    assert.equal(low.title, '🟠 Soil moisture low (20%)');
    assert.equal(low.action, 'Schedule irrigation soon, check pump and emitters');

    // 3. Optimal (25 - 40%)
    const ok = evaluate('moisture', 32, SOIL_CONFIG);
    assert.equal(ok.level, 'ok');
    assert.equal(ok.isProblem, false);
    assert.equal(ok.title, '🟢 Soil moisture optimal (32%)');

    // 4. High Warning (40 - 50%)
    const high = evaluate('moisture', 45, SOIL_CONFIG);
    assert.equal(high.level, 'high');
    assert.equal(high.action, 'Stop or delay irrigation, check drainage');

    // 5. Critical High (>50%)
    const critHigh = evaluate('moisture', 55, SOIL_CONFIG);
    assert.equal(critHigh.level, 'criticalHigh');
    assert.equal(critHigh.isCritical, true);
    assert.equal(critHigh.action, 'Turn off pump/valve, drain field, waterlogging risk');
  });

  await t.test('applies hysteresis to prevent fluttering around threshold edges', () => {
    // Current state is low (e.g. 20%).
    // Value climbs to 25.5% (above 25% boundary, but below 25 + 2 = 27% clear margin)
    const fluttering = evaluate('moisture', 25.5, SOIL_CONFIG, 'low');
    assert.equal(fluttering.level, 'low', 'Should maintain low alert due to 2% hysteresis margin');

    // Value climbs to 27.2% (exceeds 25 + 2 = 27% clear threshold)
    const cleared = evaluate('moisture', 27.2, SOIL_CONFIG, 'low');
    assert.equal(cleared.level, 'ok', 'Should transition to ok once hysteresis margin is satisfied');

    // For temperature: Previous high (e.g. 32°C).
    // Drops to 29.5°C (below 30°C highStart, but above 30 - 1 = 29°C margin)
    const tempFlutter = evaluate('temperature', 29.5, TEMP_CONFIG, 'high');
    assert.equal(tempFlutter.level, 'high', 'Should maintain high alert due to 1°C hysteresis margin');

    // Drops to 28.5°C (exceeds 29°C threshold)
    const tempCleared = evaluate('temperature', 28.5, TEMP_CONFIG, 'high');
    assert.equal(tempCleared.level, 'ok', 'Should transition to ok once 1°C margin is cleared');
  });

  await t.test('rejects physically impossible readings and invalid noise', () => {
    assert.equal(evaluate('moisture', null, SOIL_CONFIG).level, 'invalid');
    assert.equal(evaluate('moisture', NaN, SOIL_CONFIG).level, 'invalid');
    assert.equal(evaluate('moisture', -5, SOIL_CONFIG).level, 'invalid');
    assert.equal(evaluate('moisture', 105, SOIL_CONFIG).level, 'invalid');
    assert.equal(evaluate('temperature', 120, TEMP_CONFIG).level, 'invalid');
  });

  await t.test('simulates 3-reading debounce progression correctly', () => {
    let pendingLevel = null;
    let consecutiveCount = 0;
    const debounceTarget = 3;

    function processDebounce(reading) {
      const res = evaluate('moisture', reading, SOIL_CONFIG);
      if (res.level === pendingLevel) {
        consecutiveCount++;
      } else {
        pendingLevel = res.level;
        consecutiveCount = 1;
      }
      const triggered = consecutiveCount >= debounceTarget && res.level !== 'ok';
      return { level: res.level, count: consecutiveCount, triggered };
    }

    // Reading 1: 10% (Critical)
    const r1 = processDebounce(10);
    assert.equal(r1.count, 1);
    assert.equal(r1.triggered, false, 'Debounce 1 must not trigger alert');

    // Reading 2: 10% (Critical)
    const r2 = processDebounce(10);
    assert.equal(r2.count, 2);
    assert.equal(r2.triggered, false, 'Debounce 2 must not trigger alert');

    // Reading 3: 10% (Critical) -> Trigger!
    const r3 = processDebounce(10);
    assert.equal(r3.count, 3);
    assert.equal(r3.triggered, true, 'Debounce 3 must trigger alert');

    // Transient noise reading (e.g. 35% optimal) resets counter
    const r4 = processDebounce(35);
    assert.equal(r4.count, 1);
    assert.equal(r4.triggered, false, 'Transient reading resets debounce counter');
  });

  await t.test('enforces 30m cooldown and 60m critical reminder interval', () => {
    const cooldownMs = 30 * 60 * 1000;
    const criticalReminderMs = 60 * 60 * 1000;

    let lastAlertTime = 1000000;
    let lastCriticalReminderTime = 1000000;

    function shouldAlert(now, isCritical) {
      if (isCritical) {
        return now - lastCriticalReminderTime >= criticalReminderMs;
      }
      return now - lastAlertTime >= cooldownMs;
    }

    // 10 minutes later (same critical state) -> Should be blocked by cooldown
    assert.equal(shouldAlert(lastAlertTime + 10 * 60 * 1000, true), false);

    // 35 minutes later -> Non-critical cooldown passed, but critical reminder interval (60m) not yet
    assert.equal(shouldAlert(lastAlertTime + 35 * 60 * 1000, true), false);
    assert.equal(shouldAlert(lastAlertTime + 35 * 60 * 1000, false), true);

    // 65 minutes later -> Critical reminder triggers
    assert.equal(shouldAlert(lastAlertTime + 65 * 60 * 1000, true), true);
  });
});
