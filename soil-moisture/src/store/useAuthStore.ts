import { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database.types';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  isInitialized: boolean;
  
  initialize: () => Promise<void>;
  signIn: (email: string, pass: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, pass: string, fullName: string) => Promise<{ error: Error | null; session?: Session | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  resendConfirmation: (email: string) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  isLoading: true,
  isInitialized: false,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      let profile: Profile | null = null;
      if (session?.user) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();
        profile = data;
      }

      set({
        session,
        user: session?.user ?? null,
        profile,
        isLoading: false,
        isInitialized: true,
      });

      // Listen for auth state changes (login, logout, token refresh)
      supabase.auth.onAuthStateChange(async (_event, newSession) => {
        let newProfile: Profile | null = null;
        if (newSession?.user) {
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', newSession.user.id)
            .maybeSingle();
          newProfile = data;
        }

        set({
          session: newSession,
          user: newSession?.user ?? null,
          profile: newProfile,
          isLoading: false,
        });
      });
    } catch (err) {
      console.error('Failed to initialize auth session:', err);
      set({ isLoading: false, isInitialized: true });
    }
  },

  signIn: async (email: string, pass: string) => {
    set({ isLoading: true });
    const { error, data } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: pass,
    });

    if (error) {
      set({ isLoading: false });
      return { error };
    }

    if (data.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();
      set({ profile, user: data.user, session: data.session, isLoading: false });
    } else {
      set({ isLoading: false });
    }

    return { error: null };
  },

  signUp: async (email: string, pass: string, fullName: string) => {
    set({ isLoading: true });
    const { error, data } = await supabase.auth.signUp({
      email: email.trim(),
      password: pass,
      options: {
        data: {
          full_name: fullName.trim(),
        },
      },
    });

    if (error) {
      set({ isLoading: false });
      return { error, session: null };
    }

    set({ user: data.user, session: data.session, isLoading: false });
    return { error: null, session: data.session };
  },

  signOut: async () => {
    set({ isLoading: true });
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null, isLoading: false });
  },

  resetPassword: async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'soilmoisture://reset-password',
    });
    return { error };
  },

  resendConfirmation: async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
    });
    return { error };
  },

  refreshProfile: async () => {
    const user = get().user;
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (data) {
      set({ profile: data });
    }
  },
}));
