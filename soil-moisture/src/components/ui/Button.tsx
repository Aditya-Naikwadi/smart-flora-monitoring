import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { BorderRadius, Spacing, Typography } from '@/constants/theme';
import { useAppTheme } from '@/hooks/useAppTheme';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'destructive' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  style,
  textStyle,
  leftIcon,
  rightIcon,
}: ButtonProps) {
  const { colors } = useAppTheme();

  const getContainerStyle = (pressed: boolean): ViewStyle => {
    let backgroundColor: string = colors.primary;
    let borderColor: string = 'transparent';
    let borderWidth = 0;

    switch (variant) {
      case 'primary':
        backgroundColor = pressed ? colors.primaryDark : colors.primary;
        break;
      case 'secondary':
        backgroundColor = pressed ? colors.surfaceSubtle : colors.surface;
        borderColor = colors.border;
        borderWidth = 1;
        break;
      case 'outline':
        backgroundColor = pressed ? colors.primaryLight : 'transparent';
        borderColor = colors.primary;
        borderWidth = 1.5;
        break;
      case 'destructive':
        backgroundColor = pressed ? '#DC2626' : colors.danger;
        break;
      case 'ghost':
        backgroundColor = pressed ? colors.surfaceSubtle : 'transparent';
        break;
    }

    const paddingVertical =
      size === 'sm' ? Spacing.xs + 2 : size === 'lg' ? Spacing.md : Spacing.sm + 4;
    const paddingHorizontal =
      size === 'sm' ? Spacing.sm : size === 'lg' ? Spacing.xl : Spacing.md;

    return {
      backgroundColor,
      borderColor,
      borderWidth,
      paddingVertical,
      paddingHorizontal,
      borderRadius: BorderRadius.md,
      opacity: disabled || isLoading ? 0.6 : 1,
    };
  };

  const getTextColor = (): string => {
    switch (variant) {
      case 'primary':
      case 'destructive':
        return '#FFFFFF';
      case 'outline':
        return colors.primary;
      case 'secondary':
      case 'ghost':
        return colors.text;
    }
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || isLoading}
      style={({ pressed }) => [styles.base, getContainerStyle(pressed), style]}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || isLoading }}
    >
      {isLoading ? (
        <ActivityIndicator color={getTextColor()} size="small" />
      ) : (
        <View style={styles.contentRow}>
          {leftIcon && <View style={styles.iconMarginRight}>{leftIcon}</View>}
          <Text style={[Typography.bodyMedium, { color: getTextColor() }, textStyle]}>
            {title}
          </Text>
          {rightIcon && <View style={styles.iconMarginLeft}>{rightIcon}</View>}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconMarginRight: {
    marginRight: Spacing.xs + 2,
  },
  iconMarginLeft: {
    marginLeft: Spacing.xs + 2,
  },
});
