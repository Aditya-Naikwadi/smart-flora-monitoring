import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Import pure math functions
function convertCelsiusToFahrenheit(celsius) {
  return Number(((celsius * 9) / 5 + 32).toFixed(1));
}

function formatTemperature(celsius, unit) {
  if (unit === 'F') {
    return `${convertCelsiusToFahrenheit(celsius)}°F`;
  }
  const rounded = Math.round((celsius + Number.EPSILON) * 10) / 10;
  return `${rounded}°C`;
}

function calculateMoisturePercentage(rawAdc, airAdc = 3200, waterAdc = 1400) {
  if (airAdc === waterAdc) return 50;
  const percentage = ((airAdc - rawAdc) / (airAdc - waterAdc)) * 100;
  return Math.min(100, Math.max(0, Math.round(percentage * 10) / 10));
}

function determinePlantHealthStatus(moisture, minThreshold, maxThreshold) {
  if (moisture < minThreshold - 10 || moisture > maxThreshold + 15) {
    return 'danger';
  }
  if (moisture < minThreshold || moisture > maxThreshold) {
    return 'warning';
  }
  return 'healthy';
}

describe('Sensor Math & Calibration', () => {
  it('converts 0°C to 32°F', () => {
    assert.equal(convertCelsiusToFahrenheit(0), 32);
  });

  it('converts 25°C room temperature to 77°F', () => {
    assert.equal(convertCelsiusToFahrenheit(25), 77);
  });

  it('converts 100°C boiling point to 212°F', () => {
    assert.equal(convertCelsiusToFahrenheit(100), 212);
  });

  it('formats temperature strings accurately', () => {
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
    // Midpoint between 3200 and 1400 is 2300
    assert.equal(calculateMoisturePercentage(2300, 3200, 1400), 50);
  });

  it('evaluates plant health status correctly according to configured thresholds', () => {
    const minMoist = 30;
    const maxMoist = 70;

    // In sweet spot
    assert.equal(determinePlantHealthStatus(50, minMoist, maxMoist), 'healthy');

    // Warning zone: slightly below min
    assert.equal(determinePlantHealthStatus(25, minMoist, maxMoist), 'warning');

    // Danger zone: critically below min
    assert.equal(determinePlantHealthStatus(15, minMoist, maxMoist), 'danger');

    // Warning zone: slightly above max
    assert.equal(determinePlantHealthStatus(75, minMoist, maxMoist), 'warning');

    // Danger zone: flooded
    assert.equal(determinePlantHealthStatus(90, minMoist, maxMoist), 'danger');
  });
});
