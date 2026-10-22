import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { BorderRadius, Spacing, Typography } from '@/constants/theme';
import { useAppTheme } from '@/hooks/useAppTheme';

interface SensorGaugeProps {
  label: string;
  icon: string;
  value: number | null;
  unit: string;
  minTarget: number;
  maxTarget: number;
  minValue?: number;
  maxValue?: number;
  accentColor: string;
}

export function SensorGauge({
  label,
  icon,
  value,
  unit,
  minTarget,
  maxTarget,
  minValue = 0,
  maxValue = 100,
  accentColor,
}: SensorGaugeProps) {
  const { colors } = useAppTheme();

  const isWithinTarget =
    value !== null && value >= minTarget && value <= maxTarget;
  const isBelowTarget = value !== null && value < minTarget;

  const getStatusText = () => {
    if (value === null) return 'No Signal';
    if (isWithinTarget) return 'Optimal';
    if (isBelowTarget) return 'Too Low';
    return 'Too High';
  };

  const getStatusColor = () => {
    if (value === null) return colors.textMuted;
    if (isWithinTarget) return colors.healthy;
    return colors.warning;
  };

  // Progress bar calculation
  const clampedValue =
    value === null ? 0 : Math.max(minValue, Math.min(maxValue, value));
  const progressPercent = ((clampedValue - minValue) / (maxValue - minValue)) * 100;
  const minTargetPercent = ((minTarget - minValue) / (maxValue - minValue)) * 100;
  const maxTargetPercent = ((maxTarget - minValue) / (maxValue - minValue)) * 100;

  return (
    <Card variant="outlined" style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.labelContainer}>
          <Text style={styles.icon}>{icon}</Text>
          <Text style={[Typography.bodyMedium, { color: colors.textSecondary }]}>
            {label}
          </Text>
        </View>

        <View
          style={[
            styles.statusPill,
            { backgroundColor: `${getStatusColor()}20` },
          ]}
        >
          <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {getStatusText()}
          </Text>
        </View>
      </View>

      {/* Main Metric Display */}
      <View style={styles.valueRow}>
        <Text style={[styles.valueText, { color: accentColor }]}>
          {value !== null ? value.toFixed(1) : '--'}
        </Text>
        <Text style={[styles.unitText, { color: colors.textSecondary }]}>
          {unit}
        </Text>
      </View>

      {/* Visual Range Indicator Bar */}
      <View style={[styles.track, { backgroundColor: colors.surfaceSubtle }]}>
        {/* Ideal Zone Highlight */}
        <View
          style={[
            styles.idealZone,
            {
              left: `${minTargetPercent}%`,
              width: `${Math.max(0, maxTargetPercent - minTargetPercent)}%`,
              backgroundColor: `${colors.healthy}30`,
            },
          ]}
        />

        {/* Current Value Fill */}
        <View
          style={[
            styles.fill,
            {
              width: `${progressPercent}%`,
              backgroundColor: isWithinTarget ? colors.healthy : accentColor,
            },
          ]}
        />
      </View>

      {/* Bottom Range Marks */}
      <View style={styles.boundsRow}>
        <Text style={[styles.boundLabel, { color: colors.textMuted }]}>
          Min {minValue}{unit}
        </Text>
        <Text style={[styles.targetLabel, { color: colors.healthy }]}>
          Target: {minTarget}-{maxTarget}{unit}
        </Text>
        <Text style={[styles.boundLabel, { color: colors.textMuted }]}>
          Max {maxValue}{unit}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    fontSize: 18,
    marginRight: Spacing.xs + 2,
  },
  statusPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    ...Typography.caption,
    fontSize: 11,
    fontWeight: '700',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: Spacing.sm,
  },
  valueText: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  unitText: {
    ...Typography.bodyMedium,
    marginLeft: 4,
  },
  track: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: Spacing.xs,
  },
  idealZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    zIndex: 1,
  },
  fill: {
    height: '100%',
    borderRadius: 5,
    zIndex: 2,
  },
  boundsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  boundLabel: {
    fontSize: 10,
  },
  targetLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
});
