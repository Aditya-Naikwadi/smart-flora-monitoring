/**
 * ==============================================================================
 * Agricultural IoT Thresholds & Notification Configuration
 * ==============================================================================
 * Crop / Soil Type Default: General Greenhouse Botanical / Moist Loam Soil
 *
 * Easily customizable per crop (e.g. Monstera, Tomato, Orchid, Succulent)
 */

export type SensorType = 'moisture' | 'temperature' | 'humidity';

export type AlertLevel =
  | 'ok'
  | 'low'
  | 'high'
  | 'criticalLow'
  | 'criticalHigh'
  | 'invalid'
  | 'offline'
  | 'recovery';

export type NotificationMode = 'local' | 'push';

export interface SensorThresholdConfig {
  unit: string;
  label: string;
  physicalMin: number;
  physicalMax: number;
  criticalLow: number;
  low: number;
  highStart: number;
  criticalHigh: number;
  optimalMin: number;
  optimalMax: number;
  hysteresisMargin: number;
  actions: {
    criticalLow: string;
    low: string;
    high: string;
    criticalHigh: string;
    recovery: string;
    offline: string;
  };
  messages: {
    criticalLow: string;
    low: string;
    high: string;
    criticalHigh: string;
    recovery: string;
    offline: string;
  };
}

export interface SystemThresholdsConfig {
  cropName: string;
  soilType: string;
  notificationMode: NotificationMode;
  debounceConsecutiveCount: number;
  cooldownMinutes: number;
  criticalReminderMinutes: number;
  offlineTimeoutMinutes: number;
  sensors: Record<SensorType, SensorThresholdConfig>;
}

export const DEFAULT_THRESHOLDS_CONFIG: SystemThresholdsConfig = {
  cropName: 'General Botanical',
  soilType: 'Moist Potting Loam',
  // 'local' works 100% in Expo Go; 'push' is for EAS standalone production builds
  notificationMode: 'local',
  debounceConsecutiveCount: 3, // Require 3 consecutive readings in same level before alerting
  cooldownMinutes: 30, // Max 1 alert per sensor+level per 30 minutes
  criticalReminderMinutes: 60, // Repeat reminder every 60 minutes while critical
  offlineTimeoutMinutes: 15, // Trigger sensor offline alert after 15 mins of silence
  sensors: {
    moisture: {
      unit: '%',
      label: 'Soil Moisture',
      physicalMin: 0,
      physicalMax: 100,
      criticalLow: 15,
      low: 25,
      highStart: 40,
      criticalHigh: 50,
      optimalMin: 25,
      optimalMax: 40,
      hysteresisMargin: 2.0, // 2% margin to clear alert
      actions: {
        criticalLow: 'Irrigate immediately',
        low: 'Schedule irrigation soon, check pump and emitters',
        high: 'Stop or delay irrigation, check drainage',
        criticalHigh: 'Turn off pump/valve, drain field, waterlogging risk',
        recovery: 'Soil moisture is back in the optimal growth band.',
        offline: 'Check ESP32 Wi-Fi connectivity and power supply.',
      },
      messages: {
        criticalLow: 'Soil moisture is critically depleted, risking root dehydration.',
        low: 'Soil moisture has dropped below target hydration threshold.',
        high: 'Soil moisture is elevated above the optimal transpiration band.',
        criticalHigh: 'Soil is waterlogged, presenting high risk of root rot.',
        recovery: 'Soil moisture has recovered to optimal hydration levels.',
        offline: 'No soil moisture telemetry received for over 15 minutes.',
      },
    },
    temperature: {
      unit: '°C',
      label: 'Air Temperature',
      physicalMin: -40,
      physicalMax: 80,
      criticalLow: 5,
      low: 15,
      highStart: 30,
      criticalHigh: 35,
      optimalMin: 18,
      optimalMax: 30,
      hysteresisMargin: 1.0, // 1°C margin to clear alert
      actions: {
        criticalLow: 'Frost risk: cover crops, close vents, use heater',
        low: 'Close vents, use row covers',
        high: 'Open vents, run fans, shade net, irrigate in cooler hours',
        criticalHigh: 'Heat stress: shade, mist/fog, extra irrigation, avoid midday work',
        recovery: 'Ambient temperature is back in the optimal botanical comfort band.',
        offline: 'Check temperature sensor line and ESP32 power.',
      },
      messages: {
        criticalLow: 'Freezing conditions detected! Risk of severe cellular frost damage.',
        low: 'Temperature dropped below healthy vegetative metabolic rate.',
        high: 'High temperature detected. Leaf stomata may close to reduce transpiration.',
        criticalHigh: 'Extreme heat stress! Risk of protein denaturation and wilting.',
        recovery: 'Temperature has stabilized within safe vegetative ranges.',
        offline: 'No temperature telemetry received for over 15 minutes.',
      },
    },
    humidity: {
      unit: '% RH',
      label: 'Air Humidity',
      physicalMin: 0,
      physicalMax: 100,
      criticalLow: 30,
      low: 45,
      highStart: 70,
      criticalHigh: 85,
      optimalMin: 50,
      optimalMax: 70,
      hysteresisMargin: 2.0, // 2% margin to clear alert
      actions: {
        criticalLow: 'Mist or fog, irrigate, mulch, shade',
        low: 'Increase irrigation, light misting',
        high: 'Increase ventilation, avoid evening overhead watering',
        criticalHigh: 'Fungal risk: ventilate, run fans, reduce irrigation, inspect plants',
        recovery: 'Relative humidity has returned to balanced transpiration levels.',
        offline: 'Check DHT humidity sensor bus line.',
      },
      messages: {
        criticalLow: 'Extreme dry air! Rapid moisture evaporation from plant foliage.',
        low: 'Low atmospheric moisture causing accelerated moisture depletion.',
        high: 'High relative humidity slowing natural foliar transpiration.',
        criticalHigh: 'Saturated atmospheric air! Extreme risk of powdery mildew and botrytis.',
        recovery: 'Relative humidity has normalized within healthy bounds.',
        offline: 'No humidity telemetry received for over 15 minutes.',
      },
    },
  },
};
