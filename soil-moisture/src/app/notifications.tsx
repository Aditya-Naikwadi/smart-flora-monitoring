import '@/lib/suppressWarnings';
import React, { useEffect, useState } from 'react';
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
import { useRouter } from 'expo-router';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { BorderRadius, Spacing, Typography } from '@/constants/theme';
import {
  useAcknowledgeAllAlertsMutation,
  useAcknowledgeAlertMutation,
  useAlertsQuery,
} from '@/features/alerts/useAlerts';
import { usePushNotifications } from '@/features/alerts/usePushNotifications';
import { useAppTheme } from '@/hooks/useAppTheme';
import { Notifications } from '@/lib/notifications';
import { useSettingsStore } from '@/store/useSettingsStore';

interface NotificationLogItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  severity: 'critical' | 'warning' | 'info';
  channel: 'push' | 'system' | 'telemetry';
  read: boolean;
}

export default function NotificationSystemScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { permissionGranted, expoPushToken } = usePushNotifications();
  const { data: databaseAlerts, refetch } = useAlertsQuery();
  const acknowledgeAllMutation = useAcknowledgeAllAlertsMutation();
  const acknowledgeAlertMutation = useAcknowledgeAlertMutation();

  const {
    notificationsEnabled,
    setNotificationsEnabled,
    criticalMoistureAlerts,
    setCriticalMoistureAlerts,
    temperatureAnomalies,
    setTemperatureAnomalies,
    deviceOfflineAlerts,
    setDeviceOfflineAlerts,
    notificationSound,
    setNotificationSound,
  } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<'overview' | 'channels' | 'logs'>('overview');
  const [selectedSeverity, setSelectedSeverity] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [webPermissionStatus, setWebPermissionStatus] = useState<string>('checking...');
  const [localLogs, setLocalLogs] = useState<NotificationLogItem[]>([
    {
      id: 'sys-1',
      title: '🌿 System Notification Channel Ready',
      message: 'Push notification engine initialized with Supabase Realtime alerts.',
      timestamp: 'Just now',
      severity: 'info',
      channel: 'system',
      read: true,
    },
    {
      id: 'sys-2',
      title: '⚠️ Soil Moisture Below Target (Monstera)',
      message: 'Moisture reached 18% (Target minimum: 35%). Immediate watering recommended.',
      timestamp: '15m ago',
      severity: 'critical',
      channel: 'push',
      read: false,
    },
    {
      id: 'sys-3',
      title: '🌡️ Temperature Anomaly Detected (Snake Plant)',
      message: 'Ambient reading exceeded 31.5°C in South Window.',
      timestamp: '1h ago',
      severity: 'warning',
      channel: 'telemetry',
      read: false,
    },
  ]);

  // Sync web permissions
  useEffect(() => {
    async function checkPerms() {
      const res = await Notifications.getPermissionsAsync();
      setWebPermissionStatus(res.status);
    }
    void checkPerms();
  }, []);

  const handleRequestPermission = async () => {
    try {
      const res = await Notifications.requestPermissionsAsync();
      setWebPermissionStatus(res.status);
      if (res.granted) {
        Alert.alert('Permission Granted! ✓', 'Notifications are enabled for alerts and device telemetry.');
      } else {
        Alert.alert('Permission Denied', 'Please grant notification access in your browser or device settings.');
      }
    } catch (e) {
      Alert.alert('Error', `Could not request permissions: ${String(e)}`);
    }
  };

  const handleDispatchTestNotification = async (
    title: string,
    body: string,
    severity: 'critical' | 'warning' | 'info'
  ) => {
    try {
      setTestStatus(`Dispatching: ${title}...`);
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: notificationSound,
          badge: 1,
        },
        trigger: null,
      });

      // Append to in-app log
      const newLog: NotificationLogItem = {
        id: `test-${Date.now()}`,
        title,
        message: body,
        timestamp: 'Just now',
        severity,
        channel: 'push',
        read: false,
      };
      setLocalLogs((prev) => [newLog, ...prev]);
      setTestStatus(`✓ Dispatched: "${title}"`);
      setTimeout(() => setTestStatus(null), 3500);
    } catch (err) {
      setTestStatus(`Failed: ${String(err)}`);
      setTimeout(() => setTestStatus(null), 4000);
    }
  };

  const isPermissionActive = permissionGranted || webPermissionStatus === 'granted';

  const handleMarkAllRead = () => {
    setLocalLogs((prev) => prev.map((l) => ({ ...l, read: true })));
    acknowledgeAllMutation.mutate(undefined, {
      onSuccess: () => void refetch(),
    });
  };

  const handleAcknowledgeSingle = (id: string) => {
    setLocalLogs((prev) => prev.map((l) => (l.id === id ? { ...l, read: true } : l)));
    if (!id.startsWith('test-') && !id.startsWith('sys-')) {
      acknowledgeAlertMutation.mutate(id, {
        onSuccess: () => void refetch(),
      });
    }
  };

  const handleClearHistory = () => {
    setLocalLogs([]);
  };

  // Merge database alerts with local logs
  const combinedLogs: NotificationLogItem[] = [
    ...(databaseAlerts || []).map((a) => ({
      id: a.id,
      title:
        a.type === 'low_moisture'
          ? '⚠️ Low Moisture Warning'
          : a.type === 'high_temperature'
          ? '🌡️ High Temperature Warning'
          : `Incident: ${a.type.replace(/_/g, ' ')}`,
      message: a.message || `Reading ${a.value ?? '--'} exceeded plant threshold (${a.threshold ?? '--'}).`,
      timestamp: new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      severity: (a.type === 'low_moisture' ? 'critical' : 'warning') as 'critical' | 'warning',
      channel: 'telemetry' as const,
      read: a.acknowledged,
    })),
    ...localLogs,
  ];

  const filteredLogs = combinedLogs.filter((item) => {
    if (selectedSeverity === 'all') return true;
    return item.severity === selectedSeverity;
  });

  const unreadCount = combinedLogs.filter((i) => !i.read).length;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Top Breadcrumb & Status */}
      <View style={styles.topRow}>
        <View>
          <Text style={[Typography.caption, { color: colors.textSecondary }]}>
            SYSTEM & ALERTS
          </Text>
          <Text style={[Typography.h2, { color: colors.text }]}>
            Notification Center
          </Text>
        </View>
        <Badge
          label={notificationsEnabled ? 'Active' : 'Muted'}
          variant={notificationsEnabled ? 'healthy' : 'warning'}
        />
      </View>

      {/* Tabs / Sub-views */}
      <View style={[styles.tabBar, { backgroundColor: colors.surfaceSubtle }]}>
        <Pressable
          onPress={() => setActiveTab('overview')}
          style={[
            styles.tabItem,
            activeTab === 'overview' && { backgroundColor: colors.surface, borderRadius: BorderRadius.md },
          ]}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'overview' ? colors.primary : colors.textSecondary, fontWeight: activeTab === 'overview' ? '700' : '500' },
            ]}
          >
            Overview
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('channels')}
          style={[
            styles.tabItem,
            activeTab === 'channels' && { backgroundColor: colors.surface, borderRadius: BorderRadius.md },
          ]}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'channels' ? colors.primary : colors.textSecondary, fontWeight: activeTab === 'channels' ? '700' : '500' },
            ]}
          >
            Channels
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('logs')}
          style={[
            styles.tabItem,
            activeTab === 'logs' && { backgroundColor: colors.surface, borderRadius: BorderRadius.md },
          ]}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'logs' ? colors.primary : colors.textSecondary, fontWeight: activeTab === 'logs' ? '700' : '500' },
            ]}
          >
            Logs {unreadCount > 0 ? `(${unreadCount})` : ''}
          </Text>
        </Pressable>
      </View>

      {/* Feedback Banner */}
      {testStatus ? (
        <View
          style={[
            styles.statusBanner,
            {
              backgroundColor: testStatus.startsWith('✓') ? 'rgba(34, 197, 94, 0.15)' : 'rgba(59, 130, 246, 0.15)',
              borderColor: testStatus.startsWith('✓') ? '#22c55e' : '#3b82f6',
            },
          ]}
        >
          <Text style={[styles.statusBannerText, { color: colors.text }]}>
            {testStatus}
          </Text>
        </View>
      ) : null}

      {/* TAB 1: OVERVIEW & TEST LAB */}
      {activeTab === 'overview' && (
        <View>
          {/* Notification Gateway Status Card */}
          <Card variant="elevated" style={styles.card}>
            <View style={styles.gatewayHeader}>
              <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
                <Text style={styles.gatewayIcon}>🔔</Text>
              </View>
              <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                <Text style={[Typography.h3, { color: colors.text }]}>
                  Delivery Gateway
                </Text>
                <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                  {Platform.OS === 'web'
                    ? 'Web Browser Notification API'
                    : 'Expo Mobile Push Service'}
                </Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

            <View style={styles.metricRow}>
              <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                System Permission
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Badge
                  label={isPermissionActive ? 'GRANTED' : webPermissionStatus.toUpperCase()}
                  variant={isPermissionActive ? 'healthy' : 'warning'}
                />
                {!isPermissionActive ? (
                  <Button
                    title="Enable"
                    size="sm"
                    variant="primary"
                    onPress={handleRequestPermission}
                  />
                ) : null}
              </View>
            </View>

            <View style={styles.metricRow}>
              <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                Delivery Endpoint
              </Text>
              <Text
                style={[
                  Typography.caption,
                  { color: colors.text, fontWeight: '600', maxWidth: 180 },
                ]}
                numberOfLines={1}
              >
                {expoPushToken ? expoPushToken : Platform.OS === 'web' ? 'Browser Desktop Agent' : 'Simulator Mode'}
              </Text>
            </View>

            <View style={styles.metricRow}>
              <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                Unresolved Incidents
              </Text>
              <Text style={[Typography.caption, { color: colors.text, fontWeight: '700' }]}>
                {unreadCount} alerts pending
              </Text>
            </View>
          </Card>

          {/* Test Dispatcher Lab */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            DISPATCH TEST NOTIFICATIONS
          </Text>

          <Card variant="outlined" style={styles.card}>
            <Text style={[Typography.body, { color: colors.textSecondary, marginBottom: Spacing.md }]}>
              Trigger instant simulated alerts to verify that sound, popup banners, and incident logging function properly:
            </Text>

            <View style={styles.testBtnGrid}>
              <Button
                title="🚨 Moisture Critical (< 15%)"
                variant="outline"
                size="sm"
                onPress={() =>
                  handleDispatchTestNotification(
                    '🚨 Critical: Dry Soil Detected!',
                    'Monstera Deliciosa moisture dropped to 14%. Water plant now.',
                    'critical'
                  )
                }
                style={{ marginBottom: Spacing.xs }}
              />
              <Button
                title="❄️ Frost Anomaly (< 8°C)"
                variant="outline"
                size="sm"
                onPress={() =>
                  handleDispatchTestNotification(
                    '❄️ Frost Warning: Low Temp',
                    'Snake Plant ambient temperature dropped to 7.8°C.',
                    'warning'
                  )
                }
                style={{ marginBottom: Spacing.xs }}
              />
              <Button
                title="📶 Device Heartbeat Restored"
                variant="secondary"
                size="sm"
                onPress={() =>
                  handleDispatchTestNotification(
                    '📶 ESP32 Sensor Online',
                    'Device ESP32-MONSTERA-01 re-established WiFi telemetry connection.',
                    'info'
                  )
                }
              />
            </View>
          </Card>
        </View>
      )}

      {/* TAB 2: CHANNELS & SETTINGS */}
      {activeTab === 'channels' && (
        <View>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            NOTIFICATION RULES & CHANNELS
          </Text>

          <Card variant="outlined" style={styles.card}>
            {/* Master Push Toggle */}
            <View style={styles.settingRow}>
              <View style={{ flex: 1, marginRight: Spacing.sm }}>
                <Text style={[Typography.bodyMedium, { color: colors.text, fontWeight: '700' }]}>
                  Master Push Notifications
                </Text>
                <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                  Enable or suspend all outbound alert transmissions
                </Text>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

            {/* Critical Moisture Alerts */}
            <View style={styles.settingRow}>
              <View style={{ flex: 1, marginRight: Spacing.sm }}>
                <Text style={[Typography.bodyMedium, { color: colors.text }]}>
                  Critical Soil Moisture
                </Text>
                <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                  Alert when ADC sensor drops below minimum target calibration
                </Text>
              </View>
              <Switch
                value={criticalMoistureAlerts}
                onValueChange={setCriticalMoistureAlerts}
                disabled={!notificationsEnabled}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

            {/* Temperature Anomalies */}
            <View style={styles.settingRow}>
              <View style={{ flex: 1, marginRight: Spacing.sm }}>
                <Text style={[Typography.bodyMedium, { color: colors.text }]}>
                  Temperature & Humidity Anomalies
                </Text>
                <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                  Trigger alarms for heat waves or extreme cold snaps
                </Text>
              </View>
              <Switch
                value={temperatureAnomalies}
                onValueChange={setTemperatureAnomalies}
                disabled={!notificationsEnabled}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

            {/* Device Disconnect Alerts */}
            <View style={styles.settingRow}>
              <View style={{ flex: 1, marginRight: Spacing.sm }}>
                <Text style={[Typography.bodyMedium, { color: colors.text }]}>
                  Device Offline Disconnects
                </Text>
                <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                  Warn if ESP32 sensor heartbeat misses more than 3 consecutive ingest cycles
                </Text>
              </View>
              <Switch
                value={deviceOfflineAlerts}
                onValueChange={setDeviceOfflineAlerts}
                disabled={!notificationsEnabled}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.cardBorder }]} />

            {/* Audible Alerts */}
            <View style={styles.settingRow}>
              <View style={{ flex: 1, marginRight: Spacing.sm }}>
                <Text style={[Typography.bodyMedium, { color: colors.text }]}>
                  Audible Chimes & Sounds
                </Text>
                <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                  Play alert chime when high-priority notifications trigger
                </Text>
              </View>
              <Switch
                value={notificationSound}
                onValueChange={setNotificationSound}
                disabled={!notificationsEnabled}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
          </Card>
        </View>
      )}

      {/* TAB 3: LOGS & HISTORY */}
      {activeTab === 'logs' && (
        <View>
          {/* Action Row */}
          <View style={styles.logActionRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {(['all', 'critical', 'warning', 'info'] as const).map((sev) => (
                <Pressable
                  key={sev}
                  onPress={() => setSelectedSeverity(sev)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor:
                        selectedSeverity === sev ? colors.primary : colors.surfaceSubtle,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      {
                        color: selectedSeverity === sev ? '#FFFFFF' : colors.textSecondary,
                        fontWeight: selectedSeverity === sev ? '700' : '500',
                      },
                    ]}
                  >
                    {sev.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 6, marginTop: Spacing.sm }}>
              <Button
                title="Mark All Read"
                variant="outline"
                size="sm"
                onPress={handleMarkAllRead}
              />
              <Button
                title="Clear"
                variant="ghost"
                size="sm"
                onPress={handleClearHistory}
              />
            </View>
          </View>

          {/* Log Item List */}
          {filteredLogs.length === 0 ? (
            <Card variant="outlined" style={styles.emptyCard}>
              <Text style={{ fontSize: 32 }}>🌿</Text>
              <Text style={[Typography.h3, { color: colors.text, marginTop: Spacing.xs }]}>
                No Notifications Found
              </Text>
              <Text style={[Typography.caption, { color: colors.textSecondary, textAlign: 'center' }]}>
                There are no {selectedSeverity === 'all' ? '' : selectedSeverity} notifications recorded.
              </Text>
            </Card>
          ) : (
            filteredLogs.map((log) => (
              <Card
                key={log.id}
                variant={log.read ? 'outlined' : 'elevated'}
                style={[
                  styles.logCard,
                  !log.read && {
                    borderColor:
                      log.severity === 'critical'
                        ? '#ef4444'
                        : log.severity === 'warning'
                        ? '#f59e0b'
                        : colors.primary,
                    borderLeftWidth: 4,
                  },
                ]}
              >
                <View style={styles.logHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Badge
                      label={log.severity.toUpperCase()}
                      variant={
                        log.severity === 'critical'
                          ? 'danger'
                          : log.severity === 'warning'
                          ? 'warning'
                          : 'healthy'
                      }
                    />
                    <Text
                      style={[
                        Typography.bodyMedium,
                        {
                          color: colors.text,
                          fontWeight: log.read ? '500' : '700',
                          marginLeft: Spacing.xs,
                          flex: 1,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {log.title}
                    </Text>
                  </View>
                  <Text style={[Typography.caption, { color: colors.textMuted }]}>
                    {log.timestamp}
                  </Text>
                </View>
                <Text style={[Typography.body, { color: colors.textSecondary, marginTop: Spacing.xs, fontSize: 13 }]}>
                  {log.message}
                </Text>
                {!log.read && (
                  <View style={{ marginTop: Spacing.xs, alignItems: 'flex-end' }}>
                    <Pressable
                      onPress={() => handleAcknowledgeSingle(log.id)}
                      style={{ paddingVertical: 2, paddingHorizontal: 6 }}
                    >
                      <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '600' }}>
                        Mark as read ✓
                      </Text>
                    </Pressable>
                  </View>
                )}
              </Card>
            ))
          )}
        </View>
      )}

      {/* Return to Dashboard */}
      <View style={{ marginTop: Spacing.xl, alignItems: 'center' }}>
        <Button
          title="← Back to Dashboard"
          variant="ghost"
          onPress={() => router.replace('/(tabs)')}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl * 2,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  tabBar: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
  },
  tabItem: {
    flex: 1,
    paddingVertical: Spacing.xs + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 13,
  },
  statusBanner: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  statusBannerText: {
    ...Typography.bodyMedium,
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.caption,
    fontWeight: '700',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  gatewayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gatewayIcon: {
    fontSize: 22,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.sm,
  },
  testBtnGrid: {
    flexDirection: 'column',
    gap: 6,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  logActionRow: {
    marginBottom: Spacing.md,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  filterText: {
    fontSize: 11,
  },
  emptyCard: {
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  logCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.md,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
