import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { Card } from '@/components/ui/Card';
import { BorderRadius, Spacing, Typography } from '@/constants/theme';
import { useAppTheme } from '@/hooks/useAppTheme';
import {
  describeSvgArc,
  getGaugeColorZone,
  isValidReading,
} from '@/utils/sensorMath';

export interface SensorGaugeProps {
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
  const { colors, isDark } = useAppTheme();

  // Validate value
  const hasValue = value !== null && isValidReading(value);
  const clampedValue = hasValue
    ? Math.max(minValue, Math.min(maxValue, value as number))
    : minValue;

  // Gauge geometry configuration
  const width = 260;
  const height = 180;
  const cx = width / 2; // 130
  const cy = 125;
  const radius = 80;
  const strokeWidth = 10;
  const startAngle = 150; // Bottom-left
  const sweepAngle = 240; // Clockwise sweep to 390° (bottom-right)
  const endAngle = startAngle + sweepAngle; // 390°

  // Value fraction and angle calculations
  const range = Math.max(1, maxValue - minValue);
  const targetFraction = Math.max(0, Math.min(1, (clampedValue - minValue) / range));
  const targetAngle = startAngle + targetFraction * sweepAngle;

  const minTargetFraction = Math.max(0, Math.min(1, (minTarget - minValue) / range));
  const maxTargetFraction = Math.max(0, Math.min(1, (maxTarget - minValue) / range));
  const minTargetAngle = startAngle + minTargetFraction * sweepAngle;
  const maxTargetAngle = startAngle + maxTargetFraction * sweepAngle;

  // Animated value for smooth real-time needle motion
  const [animValue] = useState(() => new Animated.Value(hasValue ? clampedValue : minValue));
  const [currentAngle, setCurrentAngle] = useState(targetAngle);

  useEffect(() => {
    const animation = Animated.spring(animValue, {
      toValue: hasValue ? clampedValue : minValue,
      friction: 7,
      tension: 40,
      useNativeDriver: false,
    });

    animation.start();

    const listenerId = animValue.addListener(({ value: val }) => {
      const frac = Math.max(0, Math.min(1, (val - minValue) / range));
      setCurrentAngle(startAngle + frac * sweepAngle);
    });

    return () => {
      animation.stop();
      animValue.removeListener(listenerId);
    };
  }, [hasValue, clampedValue, minValue, range, startAngle, sweepAngle, animValue]);

  // Determine current color zone
  const zone = getGaugeColorZone(hasValue ? (value as number) : null, minTarget, maxTarget);

  const getStatusBadge = () => {
    switch (zone) {
      case 'optimal':
        return { text: 'Optimal', color: colors.healthy, bg: 'rgba(16, 185, 129, 0.15)' };
      case 'warning_low':
        return { text: 'Low (Warning)', color: colors.warning, bg: 'rgba(245, 158, 11, 0.15)' };
      case 'critical_low':
        return { text: 'Critically Low', color: colors.danger, bg: 'rgba(239, 68, 68, 0.15)' };
      case 'warning_high':
        return { text: 'High (Warning)', color: colors.warning, bg: 'rgba(245, 158, 11, 0.15)' };
      case 'critical_high':
        return { text: 'Critically High', color: colors.danger, bg: 'rgba(239, 68, 68, 0.15)' };
      case 'disconnected':
      default:
        return { text: 'Sensor Disconnected', color: colors.textMuted, bg: 'rgba(148, 163, 184, 0.15)' };
    }
  };

  const status = getStatusBadge();

  // Zone colors for the gauge tracks
  const lowZoneColor = colors.warning;
  const optimalZoneColor = colors.healthy;
  const highZoneColor = colors.danger;
  const trackBgColor = isDark ? '#1E293B' : '#E2E8F0';

  // SVG Paths for the 3 dial zones
  const lowZonePath = describeSvgArc(cx, cy, radius, startAngle, minTargetAngle);
  const optimalZonePath = describeSvgArc(cx, cy, radius, minTargetAngle, maxTargetAngle);
  const highZonePath = describeSvgArc(cx, cy, radius, maxTargetAngle, endAngle);

  // Active progress arc up to animated current angle
  const activeArcAngle = Math.max(startAngle + 0.5, currentAngle);
  const activeArcPath = hasValue
    ? describeSvgArc(cx, cy, radius, startAngle, activeArcAngle)
    : null;

  // Needle tip and base geometry
  const needleLength = 62;
  const needleAngleRad = (currentAngle * Math.PI) / 180;
  const tipX = cx + needleLength * Math.cos(needleAngleRad);
  const tipY = cy + needleLength * Math.sin(needleAngleRad);

  const baseLeftAngleRad = needleAngleRad + Math.PI / 2;
  const baseRightAngleRad = needleAngleRad - Math.PI / 2;
  const baseWidth = 4.5;
  const baseLeftX = cx + baseWidth * Math.cos(baseLeftAngleRad);
  const baseLeftY = cy + baseWidth * Math.sin(baseLeftAngleRad);
  const baseRightX = cx + baseWidth * Math.cos(baseRightAngleRad);
  const baseRightY = cy + baseWidth * Math.sin(baseRightAngleRad);

  // Needle counter-weight tail
  const tailLength = 12;
  const tailX = cx - tailLength * Math.cos(needleAngleRad);
  const tailY = cy - tailLength * Math.sin(needleAngleRad);

  const needlePath = `M ${baseLeftX} ${baseLeftY} L ${tipX} ${tipY} L ${baseRightX} ${baseRightY} L ${tailX} ${tailY} Z`;

  // Tick marks (5 major ticks: 0%, 25%, 50%, 75%, 100%)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const angleRad = ((startAngle + f * sweepAngle) * Math.PI) / 180;
    const rInner = radius - 8;
    const rOuter = radius + 8;
    return {
      x1: cx + rInner * Math.cos(angleRad),
      y1: cy + rInner * Math.sin(angleRad),
      x2: cx + rOuter * Math.cos(angleRad),
      y2: cy + rOuter * Math.sin(angleRad),
    };
  });

  return (
    <Card variant="outlined" style={styles.card}>
      {/* Top Header Row: Icon, Label, Status Badge */}
      <View style={styles.topRow}>
        <View style={styles.labelContainer}>
          <Text style={styles.icon}>{icon}</Text>
          <Text style={[Typography.bodyMedium, { color: colors.text, fontWeight: '600' }]}>
            {label}
          </Text>
        </View>

        <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
          <Text style={[styles.statusText, { color: status.color }]}>{status.text}</Text>
        </View>
      </View>

      {/* Speedometer Radial Dial Canvas */}
      <View style={styles.dialContainer}>
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {/* Subtle Outer Track Background */}
          <Path
            d={describeSvgArc(cx, cy, radius, startAngle, endAngle)}
            fill="none"
            stroke={trackBgColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Color Zone 1: Low (Warning / Critical) */}
          <Path
            d={lowZonePath}
            fill="none"
            stroke={lowZoneColor}
            strokeWidth={strokeWidth - 2}
            strokeOpacity={0.4}
            strokeLinecap="round"
          />

          {/* Color Zone 2: Normal / Optimal (Green) */}
          <Path
            d={optimalZonePath}
            fill="none"
            stroke={optimalZoneColor}
            strokeWidth={strokeWidth}
            strokeOpacity={0.85}
            strokeLinecap="round"
          />

          {/* Color Zone 3: High (Warning / Critical) */}
          <Path
            d={highZonePath}
            fill="none"
            stroke={highZoneColor}
            strokeWidth={strokeWidth - 2}
            strokeOpacity={0.4}
            strokeLinecap="round"
          />

          {/* Major Tick Marks */}
          {ticks.map((t, index) => (
            <Line
              key={index}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke={isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)'}
              strokeWidth={1.5}
            />
          ))}

          {/* Active Live Progress Glow Arc */}
          {activeArcPath ? (
            <Path
              d={activeArcPath}
              fill="none"
              stroke={status.color}
              strokeWidth={strokeWidth + 2}
              strokeLinecap="round"
            />
          ) : null}

          {/* Min & Max Range Boundary SVG Text */}
          <SvgText
            x={cx - radius + 5}
            y={cy + 36}
            fill={colors.textMuted}
            fontSize="11"
            fontWeight="600"
            textAnchor="middle"
          >
            {minValue}{unit}
          </SvgText>

          <SvgText
            x={cx + radius - 5}
            y={cy + 36}
            fill={colors.textMuted}
            fontSize="11"
            fontWeight="600"
            textAnchor="middle"
          >
            {maxValue}{unit}
          </SvgText>

          {/* Needle Pointer */}
          <Path
            d={needlePath}
            fill={hasValue ? (isDark ? '#F8FAFC' : '#1E293B') : colors.textMuted}
            opacity={hasValue ? 1 : 0.4}
          />

          {/* Pivot Center Hub Cap */}
          <Circle
            cx={cx}
            cy={cy}
            r={10}
            fill={isDark ? '#0F172A' : '#FFFFFF'}
            stroke={status.color}
            strokeWidth={3}
          />
          <Circle
            cx={cx}
            cy={cy}
            r={4}
            fill={status.color}
          />
        </Svg>

        {/* Center Digital Readout Box */}
        <View style={styles.readoutOverlay}>
          <View style={styles.valueRow}>
            <Text
              style={[
                styles.digitalValue,
                { color: hasValue ? colors.text : colors.textMuted },
              ]}
            >
              {hasValue ? (value as number).toFixed(1) : '--'}
            </Text>
            <Text style={[styles.digitalUnit, { color: status.color }]}>{unit}</Text>
          </View>
        </View>
      </View>

      {/* Target Zone & Calibration Legend Bar */}
      <View style={[styles.legendRow, { backgroundColor: colors.surfaceSubtle }]}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: lowZoneColor }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>
            Low &lt; {minTarget}{unit}
          </Text>
        </View>

        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: optimalZoneColor }]} />
          <Text style={[styles.legendText, { color: optimalZoneColor, fontWeight: '700' }]}>
            Normal {minTarget}-{maxTarget}{unit}
          </Text>
        </View>

        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: highZoneColor }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>
            High &gt; {maxTarget}{unit}
          </Text>
        </View>
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
    marginBottom: Spacing.xs,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    fontSize: 20,
    marginRight: Spacing.xs + 2,
  },
  statusPill: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    ...Typography.caption,
    fontSize: 11,
    fontWeight: '700',
  },
  dialContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginVertical: Spacing.xs,
  },
  readoutOverlay: {
    position: 'absolute',
    bottom: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  digitalValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  digitalUnit: {
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 3,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.sm,
    marginTop: Spacing.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  legendText: {
    fontSize: 10,
    fontWeight: '500',
  },
});
