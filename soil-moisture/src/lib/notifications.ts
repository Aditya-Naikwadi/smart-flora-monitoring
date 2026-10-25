import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const isWeb = Platform.OS === 'web';
const isSupported = !isExpoGo && !isWeb;

export const AndroidImportance = {
  UNKNOWN: 0,
  NONE: 1,
  MIN: 2,
  LOW: 3,
  DEFAULT: 4,
  HIGH: 5,
  MAX: 6,
};

// Safe native loader: Only executed in standalone Android/iOS native production builds
let nativeNotifications: any = null;

if (isSupported) {
  try {
    // Dynamic require so Expo Go never evaluates expo-notifications at bundle boot
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeNotifications = require('expo-notifications');

  } catch (err) {
    console.warn('[Notifications] Native expo-notifications not available:', err);
  }
}

export const Notifications = {
  setNotificationHandler: (handler: any) => {
    if (nativeNotifications?.setNotificationHandler) {
      try {
        nativeNotifications.setNotificationHandler(handler);
      } catch (err) {
        console.warn('[Notifications] setNotificationHandler error:', err);
      }
    }
  },

  setNotificationChannelAsync: async (channelId: string, options: any) => {
    if (nativeNotifications?.setNotificationChannelAsync) {
      try {
        return await nativeNotifications.setNotificationChannelAsync(channelId, options);
      } catch (err) {
        console.warn('[Notifications] setNotificationChannelAsync error:', err);
      }
    }
    return null;
  },

  getPermissionsAsync: async () => {
    if (nativeNotifications?.getPermissionsAsync) {
      try {
        return await nativeNotifications.getPermissionsAsync();
      } catch (err) {
        console.warn('[Notifications] getPermissionsAsync error:', err);
      }
    }
    return { status: 'denied', granted: false };
  },

  requestPermissionsAsync: async () => {
    if (nativeNotifications?.requestPermissionsAsync) {
      try {
        return await nativeNotifications.requestPermissionsAsync();
      } catch (err) {
        console.warn('[Notifications] requestPermissionsAsync error:', err);
      }
    }
    return { status: 'denied', granted: false };
  },

  getExpoPushTokenAsync: async (options?: any) => {
    if (nativeNotifications?.getExpoPushTokenAsync) {
      try {
        return await nativeNotifications.getExpoPushTokenAsync(options);
      } catch (err) {
        console.warn('[Notifications] getExpoPushTokenAsync error:', err);
      }
    }
    return { data: '' };
  },

  scheduleNotificationAsync: async (request: any) => {
    if (nativeNotifications?.scheduleNotificationAsync) {
      try {
        return await nativeNotifications.scheduleNotificationAsync(request);
      } catch (err) {
        console.warn('[Notifications] scheduleNotificationAsync error:', err);
      }
    }
    console.log('[Push Simulation] Notification scheduled:', request.content?.title, '-', request.content?.body);
    return 'simulated-id';
  },
};
