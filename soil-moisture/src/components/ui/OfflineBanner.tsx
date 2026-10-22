import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Spacing, Typography } from '@/constants/theme';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

export function OfflineBanner() {
  const { isConnected, isInternetReachable } = useNetworkStatus();

  // If connected and reachable (or null during initial probe), do not show banner
  if (isConnected && isInternetReachable !== false) {
    return null;
  }

  return (
    <View style={styles.banner}>
      <Text style={styles.icon}>⚡</Text>
      <View style={styles.textContainer}>
        <Text style={styles.title}>No Internet Connection</Text>
        <Text style={styles.subtitle}>
          Showing cached sensor telemetry. Realtime sync will resume automatically.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#D97706',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    zIndex: 9999,
  },
  icon: {
    fontSize: 16,
    marginRight: Spacing.sm,
    color: '#FFFFFF',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    ...Typography.caption,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 14,
  },
});
