import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type TemperatureUnit = 'C' | 'F';
export type ThemeMode = 'system' | 'light' | 'dark';

interface SettingsState {
  temperatureUnit: TemperatureUnit;
  themeMode: ThemeMode;
  notificationsEnabled: boolean;
  criticalMoistureAlerts: boolean;
  temperatureAnomalies: boolean;
  deviceOfflineAlerts: boolean;
  notificationSound: boolean;
  
  setTemperatureUnit: (unit: TemperatureUnit) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setCriticalMoistureAlerts: (enabled: boolean) => void;
  setTemperatureAnomalies: (enabled: boolean) => void;
  setDeviceOfflineAlerts: (enabled: boolean) => void;
  setNotificationSound: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      temperatureUnit: 'C',
      themeMode: 'system',
      notificationsEnabled: true,
      criticalMoistureAlerts: true,
      temperatureAnomalies: true,
      deviceOfflineAlerts: true,
      notificationSound: true,

      setTemperatureUnit: (unit) => set({ temperatureUnit: unit }),
      setThemeMode: (mode) => set({ themeMode: mode }),
      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
      setCriticalMoistureAlerts: (enabled) => set({ criticalMoistureAlerts: enabled }),
      setTemperatureAnomalies: (enabled) => set({ temperatureAnomalies: enabled }),
      setDeviceOfflineAlerts: (enabled) => set({ deviceOfflineAlerts: enabled }),
      setNotificationSound: (enabled) => set({ notificationSound: enabled }),
    }),
    {
      name: 'smart-plant-settings',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

/**
 * Converts Celsius to user-preferred unit (°C or °F) with formatted string
 */
export function formatTemperature(celsius: number | null | undefined, unit: TemperatureUnit): string {
  if (celsius == null || isNaN(celsius) || !isFinite(celsius)) {
    return '--';
  }
  if (unit === 'F') {
    const fahrenheit = (celsius * 9) / 5 + 32;
    return `${fahrenheit.toFixed(1)}°F`;
  }
  return `${celsius.toFixed(1)}°C`;
}
