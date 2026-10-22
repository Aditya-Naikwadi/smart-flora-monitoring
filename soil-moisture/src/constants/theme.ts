import { Platform } from 'react-native';

export const Colors = {
  light: {
    // Primary Brand
    primary: '#059669', // Emerald 600
    primaryLight: '#D1FAE5', // Emerald 100
    primaryDark: '#047857', // Emerald 700
    
    // Status & Sensor Accents
    healthy: '#10B981', // Emerald 500
    warning: '#F59E0B', // Amber 500
    danger: '#EF4444', // Red 500
    moisture: '#0284C7', // Sky 600
    temperature: '#F97316', // Orange 500
    humidity: '#06B6D4', // Cyan 500
    offline: '#6B7280', // Gray 500

    // Neutral Surfaces
    background: '#F8FAFC', // Slate 50
    surface: '#FFFFFF',
    surfaceSubtle: '#F1F5F9', // Slate 100
    card: '#FFFFFF',
    cardBorder: '#E2E8F0', // Slate 200

    // Legacy template support
    backgroundElement: '#F1F5F9',
    backgroundSelected: '#E2E8F0',

    // Typography
    text: '#0F172A', // Slate 900
    textSecondary: '#64748B', // Slate 500
    textMuted: '#94A3B8', // Slate 400
    textInverse: '#FFFFFF',

    // Interactive
    border: '#CBD5E1', // Slate 300
    inputBackground: '#F8FAFC',
    tabBar: '#FFFFFF',
    tabBarBorder: '#E2E8F0',
  },
  dark: {
    // Primary Brand
    primary: '#10B981', // Emerald 500
    primaryLight: '#064E3B', // Emerald 900
    primaryDark: '#059669', // Emerald 600

    // Status & Sensor Accents
    healthy: '#34D399', // Emerald 400
    warning: '#FBBF24', // Amber 400
    danger: '#F87171', // Red 400
    moisture: '#38BDF8', // Sky 400
    temperature: '#FB923C', // Orange 400
    humidity: '#22D3EE', // Cyan 400
    offline: '#9CA3AF', // Gray 400

    // Neutral Surfaces
    background: '#0B0F19', // Deep dark Slate
    surface: '#1E293B', // Slate 800
    surfaceSubtle: '#111827', // Gray 900
    card: '#161F30', // Custom sleek dark card
    cardBorder: '#293548',

    // Legacy template support
    backgroundElement: '#1E293B',
    backgroundSelected: '#334155',

    // Typography
    text: '#F8FAFC', // Slate 50
    textSecondary: '#94A3B8', // Slate 400
    textMuted: '#64748B', // Slate 500
    textInverse: '#0F172A',

    // Interactive
    border: '#334155', // Slate 700
    inputBackground: '#0F172A',
    tabBar: '#111827',
    tabBarBorder: '#1F2937',
  },
} as const;

export type ThemeColors = typeof Colors.light;
export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'sans-serif',
    serif: 'serif',
    rounded: 'sans-serif',
    mono: 'monospace',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

export const BorderRadius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const Typography = {
  h1: {
    fontSize: 28,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 22,
    fontWeight: '600' as const,
    letterSpacing: -0.3,
  },
  h3: {
    fontSize: 18,
    fontWeight: '600' as const,
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 22,
  },
  bodyMedium: {
    fontSize: 15,
    fontWeight: '500' as const,
    lineHeight: 22,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 16,
  },
  badge: {
    fontSize: 11,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
  },
};
