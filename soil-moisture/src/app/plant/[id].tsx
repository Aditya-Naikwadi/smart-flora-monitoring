import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { TelemetryChart } from '@/components/charts/TelemetryChart';
import { SensorGauge } from '@/components/plants/SensorGauge';
import { ThresholdEditorModal } from '@/components/plants/ThresholdEditorModal';
import { Badge, BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { BorderRadius, Spacing, Typography } from '@/constants/theme';
import { calculatePlantHealth } from '@/features/plants/api';
import { usePlantDetailQuery } from '@/features/plants/usePlants';
import { useRealtimeReadings } from '@/features/readings/useRealtimeReadings';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useSettingsStore } from '@/store/useSettingsStore';

export default function PlantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const plantId = id || '';

  const { colors } = useAppTheme();
  const temperatureUnit = useSettingsStore((s) => s.temperatureUnit);
  const { data, isLoading, isError, error, refetch, isRefetching } = usePlantDetailQuery(plantId);
  const { status: realtimeStatus, liveReading, lastEventAt } = useRealtimeReadings(plantId);

  const [isEditingThresholds, setIsEditingThresholds] = useState(false);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: colors.background }]}>
        <Text style={[Typography.h3, { color: colors.danger, marginBottom: Spacing.xs }]}>
          Plant Not Found
        </Text>
        <Text style={[Typography.body, { color: colors.textSecondary, marginBottom: Spacing.md }]}>
          {error instanceof Error ? error.message : 'Could not retrieve plant details'}
        </Text>
        <Button title="Retry" onPress={() => refetch()} />
      </View>
    );
  }

  const { plant, device } = data;
  const latestReading = liveReading || data.latestReading;
  const healthStatus = calculatePlantHealth(plant, device, latestReading);

  // Safe numerical extractions to prevent Number(null) turning into 0
  const moistureValue =
    latestReading && latestReading.soil_moisture_percent != null && !isNaN(Number(latestReading.soil_moisture_percent))
      ? Number(latestReading.soil_moisture_percent)
      : null;

  const rawTemp =
    latestReading && latestReading.temperature_c != null && !isNaN(Number(latestReading.temperature_c))
      ? Number(latestReading.temperature_c)
      : null;

  const temperatureValue =
    rawTemp !== null
      ? temperatureUnit === 'F'
        ? (rawTemp * 9) / 5 + 32
        : rawTemp
      : null;

  const humidityValue =
    latestReading && latestReading.humidity_percent != null && !isNaN(Number(latestReading.humidity_percent))
      ? Number(latestReading.humidity_percent)
      : null;

  const getStatusBadge = (): { label: string; variant: BadgeVariant } => {
    switch (healthStatus) {
      case 'healthy':
        return { label: 'Optimal Health', variant: 'healthy' };
      case 'needs_water':
        return { label: 'Soil Dry • Water Needed', variant: 'warning' };
      case 'overwatered':
        return { label: 'Overwatered', variant: 'danger' };
      case 'too_hot':
        return { label: 'Ambient Temperature High', variant: 'danger' };
      case 'too_cold':
        return { label: 'Ambient Temperature Low', variant: 'warning' };
      case 'offline':
      default:
        return { label: 'Device Offline', variant: 'neutral' };
    }
  };

  const status = getStatusBadge();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => {
            void refetch();
          }}
          tintColor={colors.primary}
        />
      }
    >
      {/* Plant Overview Header */}
      <Card variant="elevated" style={styles.headerCard}>
        <View style={styles.headerRow}>
          {plant.photo_url ? (
            <Image source={{ uri: plant.photo_url }} style={styles.photo} />
          ) : (
            <View style={[styles.placeholderPhoto, { backgroundColor: colors.primaryLight }]}>
              <Text style={styles.photoEmoji}>🪴</Text>
            </View>
          )}

          <View style={styles.headerInfo}>
            <Text style={[Typography.h2, { color: colors.text }]}>{plant.name}</Text>
            <Text style={[Typography.body, { color: colors.textSecondary }]}>
              {plant.species || 'Indoor Houseplant'}
            </Text>
            {plant.location_note ? (
              <Text style={[Typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                📍 {plant.location_note}
              </Text>
            ) : null}
            <View style={{ marginTop: Spacing.sm }}>
              <Badge label={status.label} variant={status.variant} />
            </View>
          </View>
        </View>
      </Card>

      {/* Realtime Live Telemetry Speedometer Gauges Header */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          REAL-TIME SPEEDOMETER GAUGES
        </Text>
        <View style={styles.liveIndicatorRow}>
          <View
            style={[
              styles.liveDot,
              {
                backgroundColor:
                  realtimeStatus === 'connected' ? colors.healthy : colors.warning,
              },
            ]}
          />
          <Text style={[Typography.caption, { color: colors.textSecondary }]}>
            {realtimeStatus === 'connected'
              ? lastEventAt
                ? `Live • ${lastEventAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                : 'Live Realtime'
              : 'Polling (10s)'}
          </Text>
        </View>
      </View>

      {/* 1. Soil Moisture Speedometer Dial */}
      <SensorGauge
        label="Soil Moisture"
        icon="💧"
        value={moistureValue}
        unit="%"
        minTarget={Number(plant.min_soil_moisture)}
        maxTarget={Number(plant.max_soil_moisture)}
        minValue={0}
        maxValue={100}
        accentColor={colors.moisture}
      />

      {/* 2. Temperature Speedometer Dial */}
      <SensorGauge
        label="Temperature"
        icon="🌡️"
        value={temperatureValue}
        unit={temperatureUnit === 'F' ? '°F' : '°C'}
        minTarget={
          temperatureUnit === 'F'
            ? (Number(plant.min_temperature_c) * 9) / 5 + 32
            : Number(plant.min_temperature_c)
        }
        maxTarget={
          temperatureUnit === 'F'
            ? (Number(plant.max_temperature_c) * 9) / 5 + 32
            : Number(plant.max_temperature_c)
        }
        minValue={temperatureUnit === 'F' ? 32 : 0}
        maxValue={temperatureUnit === 'F' ? 120 : 50}
        accentColor={colors.temperature}
      />

      {/* 3. Ambient Humidity Speedometer Dial */}
      <SensorGauge
        label="Ambient Air Humidity"
        icon="💨"
        value={humidityValue}
        unit="%"
        minTarget={Number(plant.min_humidity_percent)}
        maxTarget={Number(plant.max_humidity_percent)}
        minValue={0}
        maxValue={100}
        accentColor={colors.humidity}
      />

      {/* Interactive Time-Series Telemetry Charts (24h, 7d, 30d) */}
      <TelemetryChart plantId={plant.id} />

      {/* Threshold Configuration Button */}
      <Button
        title="⚙️ Configure Target Thresholds & Cooldowns"
        variant="secondary"
        size="md"
        onPress={() => setIsEditingThresholds(true)}
        style={{ marginBottom: Spacing.md }}
      />

      {/* Hardware Diagnostics Card */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: Spacing.xs }]}>
        HARDWARE & TELEMETRY DIAGNOSTICS
      </Text>
      <Card variant="outlined" style={styles.diagCard}>
        <View style={styles.diagRow}>
          <Text style={[Typography.caption, { color: colors.textSecondary }]}>Device Name</Text>
          <Text style={[Typography.bodyMedium, { color: colors.text }]}>
            {device ? device.name : 'None paired'}
          </Text>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <View style={styles.diagRow}>
          <Text style={[Typography.caption, { color: colors.textSecondary }]}>Hardware UUID</Text>
          <Text style={[Typography.caption, { color: colors.textMuted, fontFamily: 'monospace' }]}>
            {device ? device.id : 'N/A'}
          </Text>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <View style={styles.diagRow}>
          <Text style={[Typography.caption, { color: colors.textSecondary }]}>Last Telemetry Ping</Text>
          <Text style={[Typography.bodyMedium, { color: colors.text }]}>
            {device?.last_seen ? new Date(device.last_seen).toLocaleTimeString() : 'Never'}
          </Text>
        </View>

        {latestReading?.battery_voltage != null ? (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.diagRow}>
              <Text style={[Typography.caption, { color: colors.textSecondary }]}>Battery Supply</Text>
              <Text style={[Typography.bodyMedium, { color: colors.text }]}>
                {latestReading.battery_voltage}V
              </Text>
            </View>
          </>
        ) : null}

        {latestReading?.rssi != null ? (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.diagRow}>
              <Text style={[Typography.caption, { color: colors.textSecondary }]}>WiFi Signal (RSSI)</Text>
              <Text style={[Typography.bodyMedium, { color: colors.text }]}>
                {latestReading.rssi} dBm
              </Text>
            </View>
          </>
        ) : null}
      </Card>

      {/* Threshold Editor Modal */}
      <ThresholdEditorModal
        plant={plant}
        visible={isEditingThresholds}
        onClose={() => setIsEditingThresholds(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  headerCard: {
    marginBottom: Spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  photo: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.lg,
    marginRight: Spacing.md,
  },
  placeholderPhoto: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  photoEmoji: {
    fontSize: 36,
  },
  headerInfo: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    marginLeft: 4,
  },
  sectionTitle: {
    ...Typography.caption,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  liveIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  diagCard: {
    marginTop: Spacing.xs,
  },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.xs,
  },
});
