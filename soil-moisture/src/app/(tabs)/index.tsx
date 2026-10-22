import React from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { EmptyPlantsView } from '@/components/plants/EmptyPlantsView';
import { PlantCard } from '@/components/plants/PlantCard';
import { PlantSkeleton } from '@/components/plants/PlantSkeleton';
import { Button } from '@/components/ui/Button';
import { Spacing, Typography } from '@/constants/theme';
import { usePlantsQuery } from '@/features/plants/usePlants';
import { useRealtimeReadings } from '@/features/readings/useRealtimeReadings';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useAuthStore } from '@/store/useAuthStore';

export default function PlantsDashboardScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { user, profile } = useAuthStore();
  const { data: plants, isLoading, isError, error, refetch, isRefetching } = usePlantsQuery();
  const { status: realtimeStatus } = useRealtimeReadings();

  const renderHeader = () => (
    <View style={styles.header}>
      {/* Top Bar: User Greeting + Add Plant CTA */}
      <View style={styles.welcomeRow}>
        <View style={styles.greetingContainer}>
          <Text style={[Typography.caption, { color: colors.textSecondary }]}>
            PLANT COLLECTION
          </Text>
          <Text style={[Typography.h2, { color: colors.text }]}>
            {profile?.full_name || user?.email?.split('@')[0] || 'My Greenhouse'}
          </Text>
        </View>
        <Button
          title="+ Add Plant"
          size="sm"
          onPress={() => router.push('/add-plant')}
        />
      </View>

      {/* Realtime Live Connection Pill */}
      <View
        style={[
          styles.statusPill,
          {
            backgroundColor:
              realtimeStatus === 'connected'
                ? 'rgba(16, 185, 129, 0.12)'
                : 'rgba(245, 158, 11, 0.12)',
          },
        ]}
      >
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor:
                realtimeStatus === 'connected' ? colors.healthy : colors.warning,
            },
          ]}
        />
        <Text
          style={[
            styles.statusPillText,
            {
              color:
                realtimeStatus === 'connected' ? colors.healthy : colors.warning,
            },
          ]}
        >
          {realtimeStatus === 'connected'
            ? 'Realtime WebSocket Active'
            : 'Reconnecting (Background Polling)'}
        </Text>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {renderHeader()}
        <View style={styles.content}>
          <PlantSkeleton />
          <PlantSkeleton />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {renderHeader()}
        <View style={styles.errorContainer}>
          <Text style={[Typography.h3, { color: colors.danger, marginBottom: Spacing.xs }]}>
            Unable to load plants
          </Text>
          <Text style={[Typography.body, { color: colors.textSecondary, textAlign: 'center', marginBottom: Spacing.lg }]}>
            {error instanceof Error ? error.message : 'Please check your internet connection'}
          </Text>
          <Button title="Retry" onPress={() => refetch()} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={plants || []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PlantCard plant={item} />}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={<EmptyPlantsView />}
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
  welcomeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  greetingContainer: {
    flex: 1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: Spacing.xs,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  errorContainer: {
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xxl,
  },
});
