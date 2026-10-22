import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { BorderRadius, Spacing, Typography } from '@/constants/theme';
import { AlertWithPlant } from '@/features/alerts/api';
import { useAcknowledgeAlertMutation } from '@/features/alerts/useAlerts';
import { useAppTheme } from '@/hooks/useAppTheme';

interface AlertItemProps {
  alert: AlertWithPlant;
}

function formatAlertTime(isoString: string): string {
  const date = new Date(isoString);
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function AlertItem({ alert }: AlertItemProps) {
  const { colors } = useAppTheme();
  const acknowledgeMutation = useAcknowledgeAlertMutation();

  const getAlertMetadata = () => {
    switch (alert.type) {
      case 'low_moisture':
        return { icon: '💧', color: colors.warning, label: 'Low Soil Moisture' };
      case 'high_moisture':
        return { icon: '🌊', color: colors.danger, label: 'Soil Overwatered' };
      case 'high_temperature':
        return { icon: '🔥', color: colors.danger, label: 'Excessive Heat' };
      case 'low_temperature':
        return { icon: '❄️', color: colors.warning, label: 'Low Temperature' };
      case 'low_humidity':
        return { icon: '🌵', color: colors.warning, label: 'Dry Air Humidity' };
      case 'high_humidity':
        return { icon: '💨', color: colors.warning, label: 'High Air Humidity' };
      case 'device_offline':
        return { icon: '⚠️', color: colors.danger, label: 'Sensor Device Offline' };
      case 'device_online':
        return { icon: '✅', color: colors.healthy, label: 'Device Back Online' };
      default:
        return { icon: '🔔', color: colors.primary, label: 'Alert Notice' };
    }
  };

  const meta = getAlertMetadata();

  return (
    <Card
      variant="outlined"
      style={[
        styles.card,
        !alert.acknowledged && {
          borderLeftWidth: 4,
          borderLeftColor: meta.color,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <Text style={styles.icon}>{meta.icon}</Text>
          <View>
            <Text style={[Typography.bodyMedium, { color: colors.text }]}>
              {meta.label}
            </Text>
            <Text style={[Typography.caption, { color: colors.primary, fontWeight: '600' }]}>
              🪴 {alert.plantName}
            </Text>
          </View>
        </View>

        {!alert.acknowledged ? (
          <Button
            title="Acknowledge"
            variant="outline"
            size="sm"
            onPress={() => acknowledgeMutation.mutate(alert.id)}
            isLoading={acknowledgeMutation.isPending}
          />
        ) : (
          <View style={[styles.ackBadge, { backgroundColor: colors.surfaceSubtle }]}>
            <Text style={[styles.ackText, { color: colors.textMuted }]}>
              Acknowledged ✓
            </Text>
          </View>
        )}
      </View>

      <Text style={[Typography.body, { color: colors.textSecondary, marginTop: Spacing.sm }]}>
        {alert.message}
      </Text>

      <Text style={[styles.timestamp, { color: colors.textMuted }]}>
        {formatAlertTime(alert.created_at)}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.sm + 4,
    padding: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: Spacing.sm,
  },
  icon: {
    fontSize: 24,
    marginRight: Spacing.sm,
  },
  timestamp: {
    fontSize: 10,
    marginTop: Spacing.xs + 2,
  },
  ackBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  ackText: {
    fontSize: 10,
    fontWeight: '600',
  },
});
