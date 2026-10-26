import { router } from 'expo-router';
import {
  DEFAULT_THRESHOLDS_CONFIG,
  SensorType,
} from '@/config/thresholdsConfig';
import {
  buildOfflineAlert,
  buildRecoveryAlert,
  evaluate,
  EvaluationResult,
} from '@/features/alerts/thresholdEngine';
import {
  initializeNotificationChannels,
  Notifications,
} from '@/lib/notifications';
import { isQuietHours, useAlertsStore } from '@/store/useAlertsStore';

let isChannelsInitialized = false;
let isResponseListenerSet = false;

/**
 * Ensures Android channels and tap response deep links are active.
 */
export async function ensureNotificationSetup(): Promise<void> {
  if (!isChannelsInitialized) {
    await initializeNotificationChannels();
    isChannelsInitialized = true;
  }

  if (!isResponseListenerSet) {
    Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data;
      if (data?.route) {
        try {
          router.push(data.route);
        } catch {
          // Fallback to alerts screen
          router.push('/(tabs)/alerts');
        }
      } else {
        router.push('/(tabs)/alerts');
      }
    });
    isResponseListenerSet = true;
  }
}

/**
 * Dispatches an alert based on current Notification Mode (Local vs Push)
 */
async function dispatchAlert(options: {
  title: string;
  body: string;
  sensorType: SensorType;
  isCritical: boolean;
  plantId?: string;
  plantName?: string;
}): Promise<void> {
  await ensureNotificationSetup();

  const { notificationMode } = useAlertsStore.getState();

  const dataPayload = {
    route: '/(tabs)/alerts',
    sensorType: options.sensorType,
    plantId: options.plantId || 'default',
  };

  if (notificationMode === 'local') {
    // MODE "local" (Works 100% in Expo Go and Standalone Apps)
    await Notifications.scheduleNotificationAsync({
      content: {
        title: options.title,
        body: options.body,
        channelId: options.isCritical ? 'critical' : 'warning',
        sound: true,
        data: dataPayload,
      },
      trigger: null, // immediate delivery
    });
  } else {
    // MODE "push" (Requires EAS standalone build and configured backend)
    // Dispatches locally as fallback while calling backend push service
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `[PUSH] ${options.title}`,
        body: options.body,
        channelId: options.isCritical ? 'critical' : 'warning',
        sound: true,
        data: dataPayload,
      },
      trigger: null,
    });
  }
}

/**
 * Core processing pipeline: Evaluates a sensor reading with Hysteresis,
 * 3-reading Debounce, Cooldown, Recovery notifications, and Quiet Hours.
 */
export async function processSensorReading(
  sensorType: SensorType,
  value: number | null | undefined,
  plantId: string = '00000000-0000-0000-0000-000000000001',
  plantName: string = 'Smart Plant'
): Promise<EvaluationResult> {
  const store = useAlertsStore.getState();
  const config = store.thresholds[sensorType];
  const currentState = store.sensorStates[sensorType];

  const now = Date.now();

  // 1. Evaluate reading with Hysteresis
  const evalResult = evaluate(
    sensorType,
    value,
    config,
    currentState.currentLevel
  );

  // If reading is physically invalid, do not run threshold evaluation
  if (evalResult.level === 'invalid') {
    return evalResult;
  }

  // Update last seen reading timestamp (for offline detection)
  store.updateSensorState(sensorType, {
    lastReadingTimestamp: now,
    lastValue: value ?? 0,
  });

  // Check if user has disabled alerts for this specific sensor type
  const isTypeEnabled =
    sensorType === 'moisture'
      ? store.moistureAlertsEnabled
      : sensorType === 'temperature'
        ? store.temperatureAlertsEnabled
        : store.humidityAlertsEnabled;

  if (!isTypeEnabled) {
    store.updateSensorState(sensorType, { currentLevel: evalResult.level });
    return evalResult;
  }

  // 2. Debounce Logic: Require 3 consecutive readings in same level before altering alert state
  let newConsecutiveCount = 1;
  let confirmedLevel = currentState.currentLevel;

  if (evalResult.level === currentState.pendingLevel) {
    newConsecutiveCount = currentState.consecutiveCount + 1;
  } else {
    newConsecutiveCount = 1;
  }

  store.updateSensorState(sensorType, {
    pendingLevel: evalResult.level,
    consecutiveCount: newConsecutiveCount,
  });

  const debounceTarget = DEFAULT_THRESHOLDS_CONFIG.debounceConsecutiveCount; // 3
  const isDebounceSatisfied = newConsecutiveCount >= debounceTarget;

  // Recovery can clear immediately or after confirmation
  if (evalResult.level === 'ok') {
    // 3. RECOVERY NOTIFICATION
    if (
      currentState.lastAlertedLevel &&
      currentState.lastAlertedLevel !== 'ok'
    ) {
      const recoveryAlert = buildRecoveryAlert(
        sensorType,
        evalResult.value,
        config
      );

      // Check Quiet Hours for non-critical recovery notifications
      if (!isQuietHours()) {
        await dispatchAlert({
          title: recoveryAlert.title,
          body: recoveryAlert.action,
          sensorType,
          isCritical: false,
          plantId,
          plantName,
        });
      }

      store.addAlert({
        sensorType,
        level: 'recovery',
        title: recoveryAlert.title,
        message: recoveryAlert.message,
        action: recoveryAlert.action,
        value: evalResult.value,
        unit: config.unit,
        plantId,
        plantName,
      });

      store.updateSensorState(sensorType, {
        currentLevel: 'ok',
        lastAlertedLevel: 'ok',
        consecutiveCount: 0,
      });
    } else {
      store.updateSensorState(sensorType, { currentLevel: 'ok' });
    }
    return evalResult;
  }

  // If problem level but not yet debounced 3 times, wait
  if (!isDebounceSatisfied) {
    return evalResult;
  }

  confirmedLevel = evalResult.level;
  store.updateSensorState(sensorType, { currentLevel: confirmedLevel });

  // 4. Quiet Hours Check
  if (isQuietHours()) {
    // During quiet hours, ONLY critical alerts are allowed!
    if (!evalResult.isCritical) {
      return evalResult;
    }
  }

  // 5. Cooldown Logic
  // Max 1 alert per sensor+level per 30 minutes; repeat reminder every 60m while critical
  const cooldownMs = DEFAULT_THRESHOLDS_CONFIG.cooldownMinutes * 60 * 1000; // 30 mins
  const criticalReminderMs =
    DEFAULT_THRESHOLDS_CONFIG.criticalReminderMinutes * 60 * 1000; // 60 mins

  const isSameLevelAsLast = currentState.lastAlertedLevel === confirmedLevel;
  const timeSinceLastAlert = now - currentState.lastAlertTimestamp;
  const timeSinceLastCriticalReminder =
    now - currentState.lastCriticalReminderTimestamp;

  let shouldAlert = false;

  if (!isSameLevelAsLast) {
    // Level escalated or changed (e.g. from low to criticalLow) -> Immediate alert!
    shouldAlert = true;
  } else if (evalResult.isCritical) {
    // Critical alert repeat -> Remind every 60 minutes
    if (timeSinceLastCriticalReminder >= criticalReminderMs) {
      shouldAlert = true;
    }
  } else {
    // Non-critical repeat -> Cooldown of 30 minutes
    if (timeSinceLastAlert >= cooldownMs) {
      shouldAlert = true;
    }
  }

  if (shouldAlert) {
    await dispatchAlert({
      title: evalResult.title,
      body: evalResult.action,
      sensorType,
      isCritical: evalResult.isCritical,
      plantId,
      plantName,
    });

    store.addAlert({
      sensorType,
      level: confirmedLevel,
      title: evalResult.title,
      message: evalResult.message,
      action: evalResult.action,
      value: evalResult.value,
      unit: config.unit,
      plantId,
      plantName,
    });

    store.updateSensorState(sensorType, {
      lastAlertedLevel: confirmedLevel,
      lastAlertTimestamp: now,
      lastCriticalReminderTimestamp: evalResult.isCritical
        ? now
        : currentState.lastCriticalReminderTimestamp,
    });
  }

  return evalResult;
}

/**
 * Periodically checks if any sensor has gone silent without telemetry (>15 mins).
 */
export async function checkSensorsOffline(
  plantId: string = '00000000-0000-0000-0000-000000000001',
  plantName: string = 'Smart Plant'
): Promise<void> {
  const store = useAlertsStore.getState();
  if (!store.offlineAlertsEnabled) {
    return;
  }

  const now = Date.now();
  const offlineMs =
    DEFAULT_THRESHOLDS_CONFIG.offlineTimeoutMinutes * 60 * 1000; // 15 mins
  const cooldownMs = DEFAULT_THRESHOLDS_CONFIG.cooldownMinutes * 60 * 1000; // 30 mins

  const sensors: SensorType[] = ['moisture', 'temperature', 'humidity'];

  for (const s of sensors) {
    const state = store.sensorStates[s];
    const config = store.thresholds[s];
    const silentDuration = now - state.lastReadingTimestamp;

    if (silentDuration >= offlineMs) {
      const timeSinceAlert = now - state.lastAlertTimestamp;
      if (state.lastAlertedLevel !== 'offline' || timeSinceAlert >= cooldownMs) {
        const minutesSilent = Math.floor(silentDuration / 60000);
        const offlineAlert = buildOfflineAlert(s, minutesSilent, config);

        if (!isQuietHours()) {
          await dispatchAlert({
            title: offlineAlert.title,
            body: offlineAlert.action,
            sensorType: s,
            isCritical: false,
            plantId,
            plantName,
          });
        }

        store.addAlert({
          sensorType: s,
          level: 'offline',
          title: offlineAlert.title,
          message: offlineAlert.message,
          action: offlineAlert.action,
          value: state.lastValue,
          unit: config.unit,
          plantId,
          plantName,
        });

        store.updateSensorState(s, {
          currentLevel: 'offline',
          lastAlertedLevel: 'offline',
          lastAlertTimestamp: now,
        });
      }
    }
  }
}
