import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { BorderRadius, Spacing, Typography } from '@/constants/theme';
import { useAppTheme } from '@/hooks/useAppTheme';

export function EmptyPlantsView() {
  const router = useRouter();
  const { colors } = useAppTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
        <Text style={styles.emoji}>🌱</Text>
      </View>
      <Text style={[Typography.h2, { color: colors.text, marginTop: Spacing.md }]}>
        No Plants Added Yet
      </Text>
      <Text
        style={[
          Typography.body,
          { color: colors.textSecondary, textAlign: 'center', marginTop: Spacing.xs, marginBottom: Spacing.xl },
        ]}
      >
        Add your first houseplant or garden bed and pair an ESP32 sensor to begin real-time monitoring.
      </Text>
      <Button
        title="Add & Pair Plant"
        onPress={() => router.push('/add-plant')}
        size="lg"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 40,
  },
});
