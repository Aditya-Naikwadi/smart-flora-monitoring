import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { BorderRadius, Spacing, Typography } from '@/constants/theme';
import { useAppTheme } from '@/hooks/useAppTheme';

export type BadgeVariant = 'healthy' | 'warning' | 'danger' | 'info' | 'neutral';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
  showDot?: boolean;
}

export function Badge({
  label,
  variant = 'neutral',
  style,
  showDot = true,
}: BadgeProps) {
  const { colors, isDark } = useAppTheme();

  const getColors = () => {
    switch (variant) {
      case 'healthy':
        return {
          bg: isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.15)',
          text: colors.healthy,
          dot: colors.healthy,
        };
      case 'warning':
        return {
          bg: isDark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.15)',
          text: colors.warning,
          dot: colors.warning,
        };
      case 'danger':
        return {
          bg: isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.15)',
          text: colors.danger,
          dot: colors.danger,
        };
      case 'info':
        return {
          bg: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)',
          text: colors.moisture,
          dot: colors.moisture,
        };
      case 'neutral':
      default:
        return {
          bg: colors.surfaceSubtle,
          text: colors.textSecondary,
          dot: colors.textMuted,
        };
    }
  };

  const current = getColors();

  return (
    <View style={[styles.badge, { backgroundColor: current.bg }, style]}>
      {showDot && (
        <View style={[styles.dot, { backgroundColor: current.dot }]} />
      )}
      <Text style={[Typography.badge, { color: current.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
});
