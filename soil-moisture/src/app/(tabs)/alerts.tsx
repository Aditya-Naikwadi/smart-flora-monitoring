import React, { useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AlertItem } from '@/components/alerts/AlertItem';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { BorderRadius, Spacing, Typography } from '@/constants/theme';
import {
  useAcknowledgeAllAlertsMutation,
  useAlertsQuery,
} from '@/features/alerts/useAlerts';
import { usePlantsQuery } from '@/features/plants/usePlants';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useRouter } from 'expo-router';

export default function AlertsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [selectedPlantId, setSelectedPlantId] = useState<string | undefined>(undefined);

  const { data: plants } = usePlantsQuery();
  const { data: alerts, isLoading, refetch, isRefetching } = useAlertsQuery(selectedPlantId);
  const acknowledgeAllMutation = useAcknowledgeAllAlertsMutation();

  const unreadAlerts = (alerts || []).filter((a) => !a.acknowledged);

  const renderHeader = () => (
    <View style={styles.header}>
      {/* Top Banner: Unacknowledged Status & Acknowledge All Action */}
      <View style={styles.topRow}>
        <View>
          <Text style={[Typography.caption, { color: colors.textSecondary }]}>
            INCIDENT MONITOR
          </Text>
          <Text style={[Typography.h2, { color: colors.text }]}>
            {unreadAlerts.length} Unresolved
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Button
            title="Configure Rules ⚙️"
            variant="ghost"
            size="sm"
            onPress={() => router.push('/notifications')}
          />
          {unreadAlerts.length > 0 ? (
            <Button
              title="Mark All Read"
              variant="secondary"
              size="sm"
              onPress={() => acknowledgeAllMutation.mutate(selectedPlantId)}
              isLoading={acknowledgeAllMutation.isPending}
            />
          ) : null}
        </View>
      </View>

      {/* Horizontal Plant Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        <Pressable
          onPress={() => setSelectedPlantId(undefined)}
          style={[
            styles.filterChip,
            {
              backgroundColor:
                selectedPlantId === undefined ? colors.primary : colors.surfaceSubtle,
            },
          ]}
        >
          <Text
            style={[
              styles.filterText,
              {
                color: selectedPlantId === undefined ? '#FFFFFF' : colors.textSecondary,
                fontWeight: selectedPlantId === undefined ? '700' : '500',
              },
            ]}
          >
            All Plants
          </Text>
        </Pressable>

        {(plants || []).map((p) => {
          const isSelected = selectedPlantId === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => setSelectedPlantId(p.id)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: isSelected ? colors.primary : colors.surfaceSubtle,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  {
                    color: isSelected ? '#FFFFFF' : colors.textSecondary,
                    fontWeight: isSelected ? '700' : '500',
                  },
                ]}
              >
                🪴 {p.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={alerts || []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <AlertItem alert={item} />}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          isLoading ? (
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>
              Loading alert logs...
            </Text>
          ) : (
            <Card variant="outlined" style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🌿</Text>
              <Text style={[Typography.h3, { color: colors.text, marginTop: Spacing.sm }]}>
                No Active Incidents
              </Text>
              <Text
                style={[
                  Typography.body,
                  { color: colors.textSecondary, textAlign: 'center', marginTop: 4 },
                ]}
              >
                All your plants are thriving within their calibrated moisture and temperature parameters.
              </Text>
            </Card>
          )
        }
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
      />
    </View>
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
  header: {
    marginBottom: Spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  filterRow: {
    flexDirection: 'row',
    gap: Spacing.xs + 2,
    paddingVertical: 2,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
  },
  filterText: {
    fontSize: 12,
  },
  loadingText: {
    ...Typography.caption,
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
  emptyCard: {
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  emptyEmoji: {
    fontSize: 36,
  },
});
