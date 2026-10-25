import '@/lib/suppressWarnings';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { usePushNotifications } from '@/features/alerts/usePushNotifications';
import { useAppTheme } from '@/hooks/useAppTheme';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/store/useAuthStore';

function RootNavigation() {
  const { colors, isDark } = useAppTheme();
  const initializeAuth = useAuthStore((s) => s.initialize);
  usePushNotifications();

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <OfflineBanner />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.surface,
          },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: {
            backgroundColor: colors.background,
          },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="add-plant"
          options={{
            presentation: 'modal',
            title: 'Add New Plant',
            headerShown: true,
          }}
        />
        <Stack.Screen
          name="plant/[id]"
          options={{
            title: 'Plant Details',
            headerShown: true,
            headerBackTitle: 'Plants',
          }}
        />
        <Stack.Screen
          name="device-pairing-key"
          options={{
            presentation: 'modal',
            title: 'Device Ingest Key',
            headerShown: true,
          }}
        />
        <Stack.Screen
          name="notifications"
          options={{
            title: 'Notification System',
            headerShown: true,
            headerBackTitle: 'Back',
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RootNavigation />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
