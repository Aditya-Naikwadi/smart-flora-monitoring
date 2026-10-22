import { useColorScheme } from 'react-native';
import { Colors } from '@/constants/theme';
import { useSettingsStore } from '@/store/useSettingsStore';

export type ResolvedTheme = typeof Colors.light;

/**
 * Returns active theme colors and dark mode boolean based on user preference and device color scheme
 */
export function useAppTheme(): {
  colors: ResolvedTheme;
  isDark: boolean;
} {
  const systemScheme = useColorScheme();
  const themeMode = useSettingsStore((s) => s.themeMode);

  const isDark =
    themeMode === 'system'
      ? systemScheme === 'dark'
      : themeMode === 'dark';

  return {
    colors: (isDark ? Colors.dark : Colors.light) as ResolvedTheme,
    isDark,
  };
}
