import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, BadgeVariant } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { BorderRadius, Spacing, Typography } from '@/constants/theme';
import { PlantWithTelemetry } from '@/features/plants/api';
import { useAppTheme } from '@/hooks/useAppTheme';
import { formatTemperature, useSettingsStore } from '@/store/useSettingsStore';

interface PlantCardProps {
  plant: PlantWithTelemetry;
}

function formatLastSeen(recordedAt: string | null): string {
  if (!recordedAt) return 'No readings yet';
  const time = new Date(recordedAt);
  return `Updated at ${time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function PlantCard({ plant }: PlantCardProps) {
  const router = useRouter();
  const { colors } = useAppTheme();
  const temperatureUnit = useSettingsStore((s) => s.temperatureUnit);

  const getStatusBadge = (): { label: string; variant: BadgeVariant } => {
    switch (plant.healthStatus) {
      case 'healthy':
        return { label: 'Healthy', variant: 'healthy' };
      case 'needs_water':
        return { label: 'Needs Water', variant: 'warning' };
      case 'overwatered':
        return { label: 'Overwatered', variant: 'danger' };
      case 'too_hot':
        return { label: 'Too Hot', variant: 'danger' };
      case 'too_cold':
        return { label: 'Too Cold', variant: 'warning' };
      case 'offline':
      default:
        return { label: 'Device Offline', variant: 'neutral' };
    }
  };

  const status = getStatusBadge();
  const reading = plant.latestReading;
  const isOnline = plant.healthStatus !== 'offline';

  return (
    <Pressable
      onPress={() => router.push(`/plant/${plant.id}`)}
      style={({ pressed }) => [styles.wrapper, pressed && styles.pressed]}
    >
      <Card variant="elevated" style={styles.card}>
        {/* Header row: Plant title, species, status pill */}
        <View style={styles.headerRow}>
          <View style={styles.imageContainer}>
            {plant.photo_url ? (
              <Image source={{ uri: plant.photo_url }} style={styles.image} />
            ) : (
              <View style={[styles.placeholderImage, { backgroundColor: colors.primaryLight }]}>
                <Text style={styles.placeholderEmoji}>🪴</Text>
              </View>
            )}
          </View>

          <View style={styles.titleContainer}>
            <View style={styles.nameRow}>
              <Text style={[Typography.h3, { color: colors.text }]} numberOfLines={1}>
                {plant.name}
              </Text>
            </View>
            <Text style={[Typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>
              {plant.species || plant.location_note || 'Indoor Plant'}
            </Text>
          </View>

          <Badge label={status.label} variant={status.variant} />
        </View>

        {/* Live Metrics Grid */}
        <View style={[styles.metricsGrid, { backgroundColor: colors.surfaceSubtle }]}>
          {/* Soil Moisture */}
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>MOISTURE</Text>
            <Text style={[Typography.h3, { color: colors.moisture }]}>
              {reading ? `${reading.soil_moisture_percent}%` : '--'}
            </Text>
            <Text style={[styles.targetRange, { color: colors.textMuted }]}>
              Ideal {plant.min_soil_moisture}-{plant.max_soil_moisture}%
            </Text>
          </View>

          <View style={[styles.verticalDivider, { backgroundColor: colors.border }]} />

          {/* Temperature */}
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>TEMP</Text>
            <Text style={[Typography.h3, { color: colors.temperature }]}>
              {reading ? formatTemperature(Number(reading.temperature_c), temperatureUnit) : '--'}
            </Text>
            <Text style={[styles.targetRange, { color: colors.textMuted }]}>
              Target {formatTemperature(Number(plant.min_temperature_c), temperatureUnit)}
            </Text>
          </View>

          <View style={[styles.verticalDivider, { backgroundColor: colors.border }]} />

          {/* Humidity */}
          <View style={styles.metricItem}>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>HUMIDITY</Text>
            <Text style={[Typography.h3, { color: colors.humidity }]}>
              {reading ? `${reading.humidity_percent}%` : '--'}
            </Text>
            <Text style={[styles.targetRange, { color: colors.textMuted }]}>
              Ideal {plant.min_humidity_percent}-{plant.max_humidity_percent}%
            </Text>
          </View>
        </View>

        {/* Card Footer: Device status & last update */}
        <View style={styles.footerRow}>
          <View style={styles.deviceIndicatorRow}>
            <View
              style={[
                styles.deviceStatusDot,
                { backgroundColor: isOnline ? colors.healthy : colors.offline },
              ]}
            />
            <Text style={[Typography.caption, { color: colors.textSecondary }]}>
              {plant.device ? plant.device.name : 'No device linked'}
            </Text>
          </View>
          <Text style={[Typography.caption, { color: colors.textMuted }]}>
            {formatLastSeen(reading?.recorded_at ?? null)}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Spacing.md,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  card: {
    padding: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  imageContainer: {
    marginRight: Spacing.md,
  },
  image: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
  },
  placeholderImage: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderEmoji: {
    fontSize: 24,
  },
  titleContainer: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricsGrid: {
    flexDirection: 'row',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.sm,
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricLabel: {
    ...Typography.caption,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  targetRange: {
    fontSize: 9,
    marginTop: 2,
  },
  verticalDivider: {
    width: 1,
    height: 36,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  deviceIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: Spacing.xs,
  },
});
