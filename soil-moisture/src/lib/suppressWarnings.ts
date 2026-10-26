import { LogBox } from 'react-native';

// Suppress known benign platform warnings in React Native LogBox
LogBox.ignoreLogs([
  'Cannot record touch end without a touch start',
  'expo-notifications',
  '[expo-notifications]',
  '`expo-notifications`',
  '[Notifications]',
  'ExpoNotificationChannelManager',
  'getExpoPushTokenAsync',
  'setNotificationChannelAsync',
  'Listening to push token changes is not yet fully supported on web',
  'Notifications handling is not yet fully supported on web',
  'Android Push notifications (remote notifications)',
]);

// Intercept console.warn in both SSR (Node.js router-server) and Native/Browser runtime
const originalWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  const message = args
    .map((arg) => (typeof arg === 'string' ? arg : typeof arg === 'object' && arg !== null ? JSON.stringify(arg) : ''))
    .join(' ');

  if (
    message.includes('Cannot record touch end without a touch start') ||
    message.includes('expo-notifications') ||
    message.includes('[Notifications]') ||
    message.includes('ExpoNotificationChannelManager') ||
    message.includes('getExpoPushTokenAsync') ||
    message.includes('setNotificationChannelAsync') ||
    message.includes('not yet fully supported on web') ||
    message.includes('removed from Expo Go with the release of SDK') ||
    message.includes('We recommend you instead use a development build')
  ) {
    return;
  }

  originalWarn(...args);
};
