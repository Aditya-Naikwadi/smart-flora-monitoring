import '@/lib/suppressWarnings';
import React, { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Notifications } from '@/lib/notifications';

import { useRouter } from 'expo-router';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { BorderRadius, Spacing, Typography } from '@/constants/theme';
import { usePushNotifications } from '@/features/alerts/usePushNotifications';
import { useAppTheme } from '@/hooks/useAppTheme';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';

export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { user, profile, signOut } = useAuthStore();
  const { permissionGranted, expoPushToken } = usePushNotifications();
  const [isDeleting, setIsDeleting] = useState(false);
  const [testNotificationSent, setTestNotificationSent] = useState(false);

  const {
    temperatureUnit,
    setTemperatureUnit,
    themeMode,
    setThemeMode,
    notificationsEnabled,
    setNotificationsEnabled,
  } = useSettingsStore();

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to log out of Smart Flora?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const handleSendTestNotification = async () => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Notification Notice',
        'Push notifications are supported on physical Android and iOS mobile devices.'
      );
      return;
    }
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🌿 Smart Flora Alert Test',
          body: 'Your device is configured properly! Incident warnings will arrive here.',
          sound: true,
          badge: 1,
        },
        trigger: null,
      });
      setTestNotificationSent(true);
      setTimeout(() => setTestNotificationSent(false), 3000);
    } catch (err) {
      Alert.alert(
        'Notification Notice',
        `Could not trigger notification: ${String(err)}`
      );
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account & Telemetry',
      'This will permanently delete your account, your paired plant devices, and all historical sensor readings. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Permanently Delete',
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;
            setIsDeleting(true);
            try {
              // Delete profile row (cascades to plants, devices, readings via foreign keys)
              await supabase.from('profiles').delete().eq('id', user.id);
              await signOut();
              router.replace('/(auth)/login');
            } catch (err) {
              Alert.alert('Error', `Failed to delete account: ${String(err)}`);
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* User Account Info */}
      <Card variant="elevated" style={styles.card}>
        <View style={styles.profileRow}>
          <View style={[styles.avatar, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.avatarText, { color: colors.primary }]}>
              {(profile?.full_name || user?.email || 'U')[0].toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <View style={styles.nameRow}>
              <Text style={[Typography.h3, { color: colors.text }]}>
                {profile?.full_name || 'Plant Caretaker'}
              </Text>
              <Badge label="Free Tier" variant="healthy" />
            </View>
            <Text style={[Typography.body, { color: colors.textSecondary }]}>
              {user?.email || 'Signed In'}
            </Text>
          </View>
        </View>
      </Card>

      {/* Preferences Section */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
        PREFERENCES
      </Text>

      <Card variant="outlined" style={styles.card}>
        {/* Temperature Units */}
        <View style={styles.settingRow}>
          <View>
            <Text style={[Typography.bodyMedium, { color: colors.text }]}>
              Temperature Unit
            </Text>
            <Text style={[Typography.caption, { color: colors.textSecondary }]}>
              Display in Celsius (°C) or Fahrenheit (°F)
            </Text>
          </View>
          <View style={styles.unitToggleGroup}>
            <Pressable
              onPress={() => setTemperatureUnit('C')}
              style={[
                styles.unitBtn,
                temperatureUnit === 'C' && { backgroundColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.unitBtnText,
                  { color: temperatureUnit === 'C' ? '#FFFFFF' : colors.text },
                ]}
              >
                °C
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setTemperatureUnit('F')}
              style={[
                styles.unitBtn,
                temperatureUnit === 'F' && { backgroundColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.unitBtnText,
                  { color: temperatureUnit === 'F' ? '#FFFFFF' : colors.text },
                ]}
              >
                °F
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

        {/* Theme Mode */}
        <View style={styles.settingRow}>
          <View>
            <Text style={[Typography.bodyMedium, { color: colors.text }]}>
              App Appearance
            </Text>
            <Text style={[Typography.caption, { color: colors.textSecondary }]}>
              Current: {themeMode.toUpperCase()}
            </Text>
          </View>
          <View style={styles.unitToggleGroup}>
            {(['system', 'light', 'dark'] as const).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => setThemeMode(mode)}
                style={[
                  styles.unitBtn,
                  themeMode === mode && { backgroundColor: colors.primary },
                ]}
              >
                <Text
                  style={[
                    styles.unitBtnText,
                    { color: themeMode === mode ? '#FFFFFF' : colors.text },
                  ]}
                >
                  {mode === 'system' ? 'Auto' : mode === 'light' ? 'Light' : 'Dark'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

        {/* Notifications Toggle */}
        <View style={styles.settingRow}>
          <View style={{ flex: 1, marginRight: Spacing.sm }}>
            <Text style={[Typography.bodyMedium, { color: colors.text }]}>
              Push Notifications
            </Text>
            <Text style={[Typography.caption, { color: colors.textSecondary }]}>
              {permissionGranted
                ? 'Permission granted • Android channel configured'
                : 'Alert warnings for moisture & heat'}
            </Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>

        {/* Test Notification & Notification Center Buttons */}
        <View style={{ marginTop: Spacing.sm, gap: 8 }}>
          <Button
            title="Open Notification System & Rules ➔"
            variant="secondary"
            size="sm"
            onPress={() => router.push('/notifications')}
          />
          <Button
            title={testNotificationSent ? 'Test Alert Sent! ✓' : 'Send Quick Test Notification'}
            variant="outline"
            size="sm"
            onPress={handleSendTestNotification}
          />
        </View>
      </Card>

      {/* System Architecture & Free Tier Specs */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
        SYSTEM ARCHITECTURE & LIMITS
      </Text>

      <Card variant="outlined" style={styles.card}>
        <View style={styles.systemRow}>
          <Text style={[Typography.caption, { color: colors.textSecondary }]}>
            Cloud Provider
          </Text>
          <Text style={[Typography.caption, { color: colors.text, fontWeight: '600' }]}>
            Supabase Free Tier (Postgres 15)
          </Text>
        </View>
        <View style={styles.systemRow}>
          <Text style={[Typography.caption, { color: colors.textSecondary }]}>
            Retention Policy
          </Text>
          <Text style={[Typography.caption, { color: colors.text, fontWeight: '600' }]}>
            7-day raw + Hourly rollups
          </Text>
        </View>
        <View style={styles.systemRow}>
          <Text style={[Typography.caption, { color: colors.textSecondary }]}>
            Ingest Security
          </Text>
          <Text style={[Typography.caption, { color: colors.text, fontWeight: '600' }]}>
            SHA-256 HMAC & Constant-Time Check
          </Text>
        </View>
        <View style={styles.systemRow}>
          <Text style={[Typography.caption, { color: colors.textSecondary }]}>
            Push Service
          </Text>
          <Text style={[Typography.caption, { color: colors.text, fontWeight: '600' }]}>
            Expo Push API ({expoPushToken ? 'Token Active' : 'Simulator Mode'})
          </Text>
        </View>
      </Card>

      {/* Account Actions */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
        ACCOUNT
      </Text>

      <Card variant="outlined" style={styles.card}>
        <Button
          title="Log Out"
          variant="secondary"
          onPress={handleSignOut}
          style={{ marginBottom: Spacing.sm }}
        />
        <Button
          title="Delete Account & Telemetry"
          variant="ghost"
          textStyle={{ color: colors.danger }}
          isLoading={isDeleting}
          onPress={handleDeleteAccount}
        />
      </Card>
    </ScrollView>
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
  sectionTitle: {
    ...Typography.caption,
    fontWeight: '700',
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  card: {
    marginBottom: Spacing.md,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  avatarText: {
    ...Typography.h3,
    fontWeight: '700',
  },
  profileInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  systemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.sm,
  },
  unitToggleGroup: {
    flexDirection: 'row',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#94A3B8',
    overflow: 'hidden',
  },
  unitBtn: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs,
  },
  unitBtnText: {
    ...Typography.caption,
    fontWeight: '600',
  },
});
