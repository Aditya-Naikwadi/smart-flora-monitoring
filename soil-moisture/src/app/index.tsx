import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useAuthStore } from '@/store/useAuthStore';

/**
 * Root Entry Gatekeeper:
 * Evaluates persistent Supabase auth session:
 * - If session active -> navigates to main dashboard /(tabs)
 * - If unauthenticated -> navigates to /(auth)/login
 */
export default function IndexGatekeeper() {
  const { session, isInitialized, isLoading } = useAuthStore();
  const { colors } = useAppTheme();

  if (!isInitialized || isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (session) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
