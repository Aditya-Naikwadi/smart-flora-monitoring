import React, { useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { Card } from '@/components/ui/Card';
import { BorderRadius, Spacing, Typography } from '@/constants/theme';
import { MetricType, TimeRange } from '@/features/readings/historyApi';
import { usePlantHistoryQuery } from '@/features/readings/usePlantHistory';
import { useAppTheme } from '@/hooks/useAppTheme';
import { formatTemperature, useSettingsStore } from '@/store/useSettingsStore';

interface TelemetryChartProps {
  plantId: string;
}

export function TelemetryChart({ plantId }: TelemetryChartProps) {
  const { colors, isDark } = useAppTheme();
  const temperatureUnit = useSettingsStore((s) => s.temperatureUnit);

  const [activeMetric, setActiveMetric] = useState<MetricType>('moisture');
  const [activeRange, setActiveRange] = useState<TimeRange>('24h');

  const { data, isLoading } = usePlantHistoryQuery(plantId, activeRange);

  const screenWidth = Dimensions.get('window').width;
  const chartWidth = Math.max(260, screenWidth - 72);

  const getMetricColor = (): string => {
    switch (activeMetric) {
      case 'moisture':
        return colors.moisture;
      case 'temperature':
        return colors.temperature;
      case 'humidity':
        return colors.humidity;
    }
  };

  const getMetricData = () => {
    if (!data) return [];
    if (activeMetric === 'moisture') return data.moisturePoints;
    if (activeMetric === 'temperature') {
      if (temperatureUnit === 'F') {
        return data.temperaturePoints.map((p) => ({
          ...p,
          value: Number(((p.value * 9) / 5 + 32).toFixed(1)),
        }));
      }
      return data.temperaturePoints;
    }
    return data.humidityPoints;
  };

  const getMetricUnit = () => {
    if (activeMetric === 'moisture') return '%';
    if (activeMetric === 'temperature') return temperatureUnit === 'F' ? '°F' : '°C';
    return '%';
  };

  const points = getMetricData();
  const stats = data?.stats?.[activeMetric];
  const accentColor = getMetricColor();

  return (
    <Card variant="outlined" style={styles.card}>
      {/* Top Header: Metric & Time Selectors */}
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          HISTORICAL TELEMETRY
        </Text>

        {/* Time Window Switcher (24h, 7d, 30d) */}
        <View style={[styles.rangePills, { backgroundColor: colors.surfaceSubtle }]}>
          {(['24h', '7d', '30d'] as const).map((range) => (
            <Pressable
              key={range}
              onPress={() => setActiveRange(range)}
              style={[
                styles.rangePill,
                activeRange === range && { backgroundColor: colors.surface },
              ]}
            >
              <Text
                style={[
                  styles.rangePillText,
                  {
                    color: activeRange === range ? colors.text : colors.textMuted,
                    fontWeight: activeRange === range ? '700' : '500',
                  },
                ]}
              >
                {range}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Metric Selector Tabs */}
      <View style={styles.metricTabsRow}>
        {(
          [
            { id: 'moisture', label: '💧 Moisture' },
            { id: 'temperature', label: '🌡️ Temp' },
            { id: 'humidity', label: '💨 Humidity' },
          ] as const
        ).map((tab) => (
          <Pressable
            key={tab.id}
            onPress={() => setActiveMetric(tab.id)}
            style={[
              styles.metricTab,
              activeMetric === tab.id && {
                borderColor: accentColor,
                backgroundColor: `${accentColor}15`,
              },
            ]}
          >
            <Text
              style={[
                styles.metricTabText,
                {
                  color: activeMetric === tab.id ? accentColor : colors.textSecondary,
                  fontWeight: activeMetric === tab.id ? '700' : '500',
                },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Stats Summary Bar */}
      {stats ? (
        <View style={[styles.statsRow, { backgroundColor: colors.surfaceSubtle }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>MIN</Text>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {activeMetric === 'temperature'
                ? formatTemperature(stats.min, temperatureUnit)
                : `${stats.min}${getMetricUnit()}`}
            </Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>AVG</Text>
            <Text style={[styles.statValue, { color: accentColor }]}>
              {activeMetric === 'temperature'
                ? formatTemperature(stats.avg, temperatureUnit)
                : `${stats.avg}${getMetricUnit()}`}
            </Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>MAX</Text>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {activeMetric === 'temperature'
                ? formatTemperature(stats.max, temperatureUnit)
                : `${stats.max}${getMetricUnit()}`}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Chart Display */}
      {isLoading ? (
        <View style={styles.chartLoading}>
          <ActivityIndicator color={accentColor} size="small" />
          <Text style={[Typography.caption, { color: colors.textSecondary, marginTop: Spacing.xs }]}>
            Loading time series...
          </Text>
        </View>
      ) : points.length === 0 ? (
        <View style={styles.chartEmpty}>
          <Text style={[Typography.caption, { color: colors.textMuted }]}>
            No historical telemetry recorded for this time range.
          </Text>
        </View>
      ) : (
        <View style={styles.chartContainer}>
          <LineChart
            data={points.map((p) => ({
              value: p.value,
              label: p.label,
              dataPointText: '',
            }))}
            width={chartWidth}
            height={160}
            curved
            color={accentColor}
            thickness={2.5}
            startFillColor={accentColor}
            endFillColor={isDark ? '#0B0F19' : '#FFFFFF'}
            startOpacity={0.4}
            endOpacity={0.02}
            areaChart
            hideDataPoints={points.length > 20}
            dataPointsColor={accentColor}
            dataPointsRadius={3}
            noOfSections={4}
            yAxisColor="transparent"
            xAxisColor={colors.cardBorder}
            yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
            xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 9 }}
            initialSpacing={10}
            endSpacing={10}
          />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.caption,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  rangePills: {
    flexDirection: 'row',
    borderRadius: BorderRadius.md,
    padding: 2,
  },
  rangePill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  rangePillText: {
    fontSize: 11,
  },
  metricTabsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  metricTab: {
    flex: 1,
    paddingVertical: Spacing.xs + 2,
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  metricTabText: {
    fontSize: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 1,
  },
  statDivider: {
    width: 1,
    height: 24,
  },
  chartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
    marginLeft: -10,
  },
  chartLoading: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartEmpty: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
