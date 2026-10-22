import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { Database } from '@/types/database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  console.warn(
    '[Supabase] Warning: EXPO_PUBLIC_SUPABASE_URL is not set. Defaulting to local: ' + supabaseUrl
  );
}

// Ensure storage adapter is SSR safe when running in Node.js
const isServer = typeof window === 'undefined';

const ssrSafeStorage = {
  getItem: (key: string) => {
    if (isServer) return Promise.resolve(null);
    return AsyncStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (isServer) return Promise.resolve();
    return AsyncStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (isServer) return Promise.resolve();
    return AsyncStorage.removeItem(key);
  },
};

/**
 * Singleton typed Supabase Client
 * Configured with AsyncStorage for persistent authentication across sessions.
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ssrSafeStorage,
    autoRefreshToken: !isServer,
    persistSession: !isServer,
    detectSessionInUrl: Platform.OS === 'web' && !isServer,
  },
});
