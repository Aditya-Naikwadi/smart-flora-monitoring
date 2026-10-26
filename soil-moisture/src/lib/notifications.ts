import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

export const isExpoGo =
  (Constants as any).appOwnership === 'expo' ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  (Constants as any).executionEnvironment === 'storeClient' ||
  Boolean((Constants as any).expoVersion);

const isWeb = Platform.OS === 'web';

export const AndroidImportance = {
  UNKNOWN: 0,
  NONE: 1,
  MIN: 2,
  LOW: 3,
  DEFAULT: 4,
  HIGH: 5,
  MAX: 6,
};

// Safe native loader: Works in both standalone builds and Expo Go
let nativeNotifications: any = null;

if (!isWeb) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeNotifications = require('expo-notifications');
  } catch {
    // Silently fall back if native module is unavailable
  }
}

// 1. Initialize Foreground Notification Presentation Handler
if (nativeNotifications?.setNotificationHandler) {
  try {
    nativeNotifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    // Silently continue
  }
}

/**
 * Configure Android notification channels for Critical vs Warning alerts.
 * Note: Android notification channels are skipped in Expo Go to avoid Java NPE.
 */
export async function initializeNotificationChannels(): Promise<void> {
  if (Platform.OS === 'android' && !isExpoGo && nativeNotifications?.setNotificationChannelAsync) {
    try {
      // 1. Critical Channel (Max Priority, Sound, Red LED, Urgent Vibration)
      await nativeNotifications.setNotificationChannelAsync('critical', {
        name: 'Critical Crop Stress Alerts',
        importance: AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#EF4444',
        sound: 'default',
        enableLights: true,
        enableVibrate: true,
        bypassDnd: true,
      });

      // 2. Warning Channel (High Priority, Amber LED)
      await nativeNotifications.setNotificationChannelAsync('warning', {
        name: 'Warning Level Crop Alerts',
        importance: AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 200],
        lightColor: '#F59E0B',
        sound: 'default',
        enableLights: true,
        enableVibrate: true,
      });
    } catch {
      // Silently ignore channel errors in sandbox
    }
  }
}

export const Notifications = {
  setNotificationHandler: (handler: any) => {
    if (nativeNotifications?.setNotificationHandler) {
      try {
        return nativeNotifications.setNotificationHandler(handler);
      } catch {
        // Silently continue
      }
    }
  },

  setNotificationChannelAsync: async (channelId: string, channel: any) => {
    if (!isExpoGo && nativeNotifications?.setNotificationChannelAsync) {
      try {
        return await nativeNotifications.setNotificationChannelAsync(channelId, channel);
      } catch {
        // Silently ignore channel errors in sandbox
      }
    }
    return null;
  },

  getPermissionsAsync: async () => {
    if (nativeNotifications?.getPermissionsAsync) {
      try {
        return await nativeNotifications.getPermissionsAsync();
      } catch {
        // Fallback
      }
    }
    if (isWeb && typeof window !== 'undefined' && 'Notification' in window) {
      const permission = (window as any).Notification.permission;
      return {
        status: permission === 'granted' ? 'granted' : permission === 'denied' ? 'denied' : 'undetermined',
        granted: permission === 'granted',
      };
    }
    return { status: 'denied', granted: false };
  },

  requestPermissionsAsync: async () => {
    if (nativeNotifications?.requestPermissionsAsync) {
      try {
        return await nativeNotifications.requestPermissionsAsync();
      } catch {
        // Fallback
      }
    }
    if (isWeb && typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const permission = await (window as any).Notification.requestPermission();
        return {
          status: permission === 'granted' ? 'granted' : 'denied',
          granted: permission === 'granted',
        };
      } catch {
        return { status: 'denied', granted: false };
      }
    }
    return { status: 'denied', granted: false };
  },

  getExpoPushTokenAsync: async (options?: any) => {
    if (!isExpoGo && nativeNotifications?.getExpoPushTokenAsync) {
      try {
        return await nativeNotifications.getExpoPushTokenAsync(options);
      } catch {
        // Suppress in unsupported environments
      }
    }
    return { data: '' };
  },

  /**
   * Dispatches an immediate local notification (Works in Expo Go and standalone apps)
   */
  scheduleNotificationAsync: async (request: {
    content: {
      title: string;
      body: string;
      data?: Record<string, unknown>;
      channelId?: string;
      sound?: boolean | string;
      badge?: number;
    };
    trigger?: any;
  }) => {
    if (nativeNotifications?.scheduleNotificationAsync) {
      try {
        return await nativeNotifications.scheduleNotificationAsync(request);
      } catch {
        // Fall through to web / simulated
      }
    }

    if (isWeb && typeof window !== 'undefined' && 'Notification' in window) {
      if ((window as any).Notification.permission === 'granted') {
        try {
          new (window as any).Notification(request.content.title, {
            body: request.content.body,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🌿</text></svg>',
          });
          return 'web-notification-id';
        } catch {
          // Fall through
        }
      }
    }

    return 'local-simulated-id';
  },

  /**
   * Listen for user tapping on a notification to handle deep linking
   */
  addNotificationResponseReceivedListener: (listener: (response: any) => void) => {
    if (nativeNotifications?.addNotificationResponseReceivedListener) {
      try {
        return nativeNotifications.addNotificationResponseReceivedListener(listener);
      } catch {
        return { remove: () => {} };
      }
    }
    return { remove: () => {} };
  },
};
