import { LogBox } from 'react-native';

// Suppress known benign platform warnings in React Native LogBox
LogBox.ignoreLogs([
  'Cannot record touch end without a touch start',
  '[expo-notifications]',
  'Listening to push token changes is not yet fully supported on web',
  'Notifications handling is not yet fully supported on web',
]);

// Intercept console.warn in both SSR (Node.js router-server) and Browser runtime
const originalWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  const message = args
    .map((arg) => (typeof arg === 'string' ? arg : typeof arg === 'object' && arg !== null ? JSON.stringify(arg) : ''))
    .join(' ');

  if (
    message.includes('Cannot record touch end without a touch start') ||
    message.includes('[expo-notifications]') ||
    message.includes('not yet fully supported on web')
  ) {
    return;
  }

  originalWarn(...args);
};
