import '@/lib/suppressWarnings';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { Notifications, AndroidImportance, isExpoGo } from '@/lib/notifications';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';

// Configure how notifications are displayed when app is in the foreground (standalone mobile only)
if (Platform.OS !== 'web' && !isExpoGo) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    // Silently ignore in unsupported environments
  }
}

/**
 * Registers device with Expo Push Service and saves the push token to Supabase profiles
 */
export function usePushNotifications() {
  const user = useAuthStore((s) => s.user);
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    // Web browsers and Expo Go store client do not support native mobile push notifications in SDK 52+
    if (Platform.OS === 'web' || isExpoGo) {
      return;
    }

    async function registerForPush() {
      if (!Device.isDevice) {
        console.log('[Push] Must use a physical device for remote push notifications');
        return;
      }

      try {
        // Configure Android channel
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('plant-alerts', {
            name: 'Plant Health Alerts',
            importance: AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#059669',
          });
        }

        // Check existing permissions
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') {
          setPermissionGranted(false);
          return;
        }

        setPermissionGranted(true);
      } catch (err) {
        console.warn('[Push] Push notifications channel or permission setup skipped in Expo Go:', err);
        return;
      }

      try {
        const tokenData = await Notifications.getExpoPushTokenAsync();
        const token = tokenData.data;
        setExpoPushToken(token);

        // Save token to user profile in Supabase
        if (user?.id && token) {
          await supabase
            .from('profiles')
            .update({ expo_push_token: token })
            .eq('id', user.id);
        }
      } catch (err) {
        console.warn('[Push] Error obtaining Expo push token:', err);
      }
    }

    if (user?.id) {
      registerForPush();
    }
  }, [user?.id]);

  return {
    expoPushToken,
    permissionGranted,
  };
}
