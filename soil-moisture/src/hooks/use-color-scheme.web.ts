import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const emptySubscribe = () => () => {};

/**
 * To support static rendering on web without hydration mismatches,
 * reads client-side color scheme safely via useSyncExternalStore.
 */
export function useColorScheme() {
  const colorScheme = useRNColorScheme();
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  return isClient ? colorScheme : 'light';
}
