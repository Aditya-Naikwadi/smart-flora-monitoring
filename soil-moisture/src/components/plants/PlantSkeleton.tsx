import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useAppTheme } from '@/hooks/useAppTheme';

export function PlantSkeleton() {
  const { colors } = useAppTheme();

  return (
    <Card variant="outlined" style={styles.card}>
      <View style={styles.headerRow}>
        <View style={[styles.avatar, { backgroundColor: colors.surfaceSubtle }]} />
        <View style={styles.headerText}>
          <View style={[styles.lineLarge, { backgroundColor: colors.surfaceSubtle }]} />
          <View style={[styles.lineSmall, { backgroundColor: colors.surfaceSubtle }]} />
        </View>
        <View style={[styles.badge, { backgroundColor: colors.surfaceSubtle }]} />
      </View>

      <View style={[styles.metricBox, { backgroundColor: colors.surfaceSubtle }]} />

      <View style={styles.footerRow}>
        <View style={[styles.lineFooter, { backgroundColor: colors.surfaceSubtle }]} />
        <View style={[styles.lineFooterSmall, { backgroundColor: colors.surfaceSubtle }]} />
      </View>
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
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    marginRight: Spacing.md,
  },
  headerText: {
    flex: 1,
  },
  lineLarge: {
    width: '60%',
    height: 16,
    borderRadius: 4,
    marginBottom: 6,
  },
  lineSmall: {
    width: '40%',
    height: 12,
    borderRadius: 4,
  },
  badge: {
    width: 70,
    height: 22,
    borderRadius: BorderRadius.full,
  },
  metricBox: {
    height: 60,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lineFooter: {
    width: '35%',
    height: 10,
    borderRadius: 3,
  },
  lineFooterSmall: {
    width: '20%',
    height: 10,
    borderRadius: 3,
  },
});
