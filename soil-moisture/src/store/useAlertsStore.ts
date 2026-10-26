import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  AlertLevel,
  DEFAULT_THRESHOLDS_CONFIG,
  NotificationMode,
  SensorThresholdConfig,
  SensorType,
} from '@/config/thresholdsConfig';

export interface StoredAlert {
  id: string;
  sensorType: SensorType;
  level: AlertLevel;
  title: string;
  message: string;
  action: string;
  value: number;
  unit: string;
  timestamp: number;
  acknowledged: boolean;
  plantId?: string;
  plantName?: string;
}

export interface SensorRuntimeState {
  currentLevel: AlertLevel;
  consecutiveCount: number;
  pendingLevel: AlertLevel;
  lastAlertedLevel: AlertLevel | null;
  lastAlertTimestamp: number;
  lastCriticalReminderTimestamp: number;
  lastReadingTimestamp: number;
  lastValue: number;
}

const DEFAULT_SENSOR_STATE: SensorRuntimeState = {
  currentLevel: 'ok',
  consecutiveCount: 0,
  pendingLevel: 'ok',
  lastAlertedLevel: null,
  lastAlertTimestamp: 0,
  lastCriticalReminderTimestamp: 0,
  lastReadingTimestamp: Date.now(),
  lastValue: 0,
};

interface AlertsState {
  // Config & Modes
  notificationMode: NotificationMode;
  quietHoursEnabled: boolean;
  quietHoursStart: string; // "22:00"
  quietHoursEnd: string; // "07:00"
  moistureAlertsEnabled: boolean;
  temperatureAlertsEnabled: boolean;
  humidityAlertsEnabled: boolean;
  offlineAlertsEnabled: boolean;

  // Custom Thresholds (Editable per crop)
  thresholds: Record<SensorType, SensorThresholdConfig>;

  // Sensor Evaluation States (persisted across restarts)
  sensorStates: Record<SensorType, SensorRuntimeState>;

  // Alert History
  alertHistory: StoredAlert[];

  // Actions
  setNotificationMode: (mode: NotificationMode) => void;
  setQuietHoursEnabled: (enabled: boolean) => void;
  setQuietHoursTimes: (start: string, end: string) => void;
  setSensorAlertToggle: (sensor: SensorType | 'offline', enabled: boolean) => void;
  updateSensorThresholds: (
    sensor: SensorType,
    updates: Partial<SensorThresholdConfig>
  ) => void;
  resetThresholdsToDefault: () => void;
  updateSensorState: (
    sensor: SensorType,
    updates: Partial<SensorRuntimeState>
  ) => void;
  addAlert: (alert: Omit<StoredAlert, 'id' | 'timestamp' | 'acknowledged'>) => void;
  acknowledgeAlert: (alertId: string) => void;
  acknowledgeAllAlerts: () => void;
  clearAlertHistory: () => void;
}

export const useAlertsStore = create<AlertsState>()(
  persist(
    (set, get) => ({
      notificationMode: DEFAULT_THRESHOLDS_CONFIG.notificationMode,
      quietHoursEnabled: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '07:00',
      moistureAlertsEnabled: true,
      temperatureAlertsEnabled: true,
      humidityAlertsEnabled: true,
      offlineAlertsEnabled: true,

      thresholds: {
        moisture: { ...DEFAULT_THRESHOLDS_CONFIG.sensors.moisture },
        temperature: { ...DEFAULT_THRESHOLDS_CONFIG.sensors.temperature },
        humidity: { ...DEFAULT_THRESHOLDS_CONFIG.sensors.humidity },
      },

      sensorStates: {
        moisture: { ...DEFAULT_SENSOR_STATE },
        temperature: { ...DEFAULT_SENSOR_STATE },
        humidity: { ...DEFAULT_SENSOR_STATE },
      },

      alertHistory: [],

      setNotificationMode: (mode) => set({ notificationMode: mode }),
      setQuietHoursEnabled: (enabled) => set({ quietHoursEnabled: enabled }),
      setQuietHoursTimes: (start, end) =>
        set({ quietHoursStart: start, quietHoursEnd: end }),

      setSensorAlertToggle: (target, enabled) => {
        if (target === 'offline') {
          set({ offlineAlertsEnabled: enabled });
        } else if (target === 'moisture') {
          set({ moistureAlertsEnabled: enabled });
        } else if (target === 'temperature') {
          set({ temperatureAlertsEnabled: enabled });
        } else if (target === 'humidity') {
          set({ humidityAlertsEnabled: enabled });
        }
      },

      updateSensorThresholds: (sensor, updates) =>
        set((state) => ({
          thresholds: {
            ...state.thresholds,
            [sensor]: {
              ...state.thresholds[sensor],
              ...updates,
            },
          },
        })),

      resetThresholdsToDefault: () =>
        set({
          thresholds: {
            moisture: { ...DEFAULT_THRESHOLDS_CONFIG.sensors.moisture },
            temperature: { ...DEFAULT_THRESHOLDS_CONFIG.sensors.temperature },
            humidity: { ...DEFAULT_THRESHOLDS_CONFIG.sensors.humidity },
          },
        }),

      updateSensorState: (sensor, updates) =>
        set((state) => ({
          sensorStates: {
            ...state.sensorStates,
            [sensor]: {
              ...state.sensorStates[sensor],
              ...updates,
            },
          },
        })),

      addAlert: (alert) => {
        const newAlert: StoredAlert = {
          ...alert,
          id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
          timestamp: Date.now(),
          acknowledged: false,
        };
        set((state) => ({
          alertHistory: [newAlert, ...state.alertHistory.slice(0, 99)], // keep last 100
        }));
      },

      acknowledgeAlert: (alertId) =>
        set((state) => ({
          alertHistory: state.alertHistory.map((a) =>
            a.id === alertId ? { ...a, acknowledged: true } : a
          ),
        })),

      acknowledgeAllAlerts: () =>
        set((state) => ({
          alertHistory: state.alertHistory.map((a) => ({
            ...a,
            acknowledged: true,
          })),
        })),

      clearAlertHistory: () => set({ alertHistory: [] }),
    }),
    {
      name: 'smart-flora-alerts-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

/**
 * Checks if the current time falls inside the user's Quiet Hours window.
 * Supports intervals that cross midnight (e.g. 22:00 to 07:00).
 */
export function isQuietHours(date: Date = new Date()): boolean {
  const { quietHoursEnabled, quietHoursStart, quietHoursEnd } =
    useAlertsStore.getState();

  if (!quietHoursEnabled) {
    return false;
  }

  const [startHour, startMin] = quietHoursStart.split(':').map(Number);
  const [endHour, endMin] = quietHoursEnd.split(':').map(Number);

  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const startMinutes = startHour * 60 + (startMin || 0);
  const endMinutes = endHour * 60 + (endMin || 0);

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  // Crosses midnight (e.g. 22:00 to 07:00)
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}
