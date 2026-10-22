import { QueryClient } from '@tanstack/react-query';

/**
 * Global TanStack QueryClient configured for IoT sensor telemetry:
 * - 30-second stale time for sensor data
 * - Automatic exponential backoff retries (max 2 attempts)
 * - Refetch on app focus / reconnect
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds
      gcTime: 1000 * 60 * 10, // 10 minutes cache retention
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});
