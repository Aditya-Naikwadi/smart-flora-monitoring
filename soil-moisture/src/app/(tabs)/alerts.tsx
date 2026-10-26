import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BorderRadius, Spacing, Typography } from '@/constants/theme';
import { useAppTheme } from '@/hooks/useAppTheme';
import {
  NotificationMode,
  SensorType,
} from '@/config/thresholdsConfig';
import { processSensorReading } from '@/features/alerts/alertManager';
import { useAlertsStore } from '@/store/useAlertsStore';
import { useRealtimeReadings } from '@/features/readings/useRealtimeReadings';

export default function AlertsScreen() {
  const { colors } = useAppTheme();
  useRealtimeReadings(); // Keep live WebSocket active

  const {
    notificationMode,
    setNotificationMode,
    quietHoursEnabled,
    setQuietHoursEnabled,
    quietHoursStart,
    quietHoursEnd,
    setQuietHoursTimes,
    moistureAlertsEnabled,
    temperatureAlertsEnabled,
    humidityAlertsEnabled,
    offlineAlertsEnabled,
    setSensorAlertToggle,
    thresholds,
    updateSensorThresholds,
    resetThresholdsToDefault,
    sensorStates,
    alertHistory,
    acknowledgeAlert,
    acknowledgeAllAlerts,
    clearAlertHistory,
  } = useAlertsStore();

  const [activeTab, setActiveTab] = useState<'status' | 'history' | 'settings'>('status');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationLog, setSimulationLog] = useState<string | null>(null);

  // Settings Modal State for Editing Thresholds
  const [editingSensor, setEditingSensor] = useState<SensorType | null>(null);
  const [tempCritLow, setTempCritLow] = useState('');
  const [tempLow, setTempLow] = useState('');
  const [tempHighStart, setTempHighStart] = useState('');
  const [tempCritHigh, setTempCritHigh] = useState('');

  const openThresholdEditor = (sensor: SensorType) => {
    const cfg = thresholds[sensor];
    setEditingSensor(sensor);
    setTempCritLow(String(cfg.criticalLow));
    setTempLow(String(cfg.low));
    setTempHighStart(String(cfg.highStart));
    setTempCritHigh(String(cfg.criticalHigh));
  };

  const saveThresholds = () => {
    if (!editingSensor) return;
    const cl = parseFloat(tempCritLow);
    const l = parseFloat(tempLow);
    const hs = parseFloat(tempHighStart);
    const ch = parseFloat(tempCritHigh);

    if (isNaN(cl) || isNaN(l) || isNaN(hs) || isNaN(ch)) {
      Alert.alert('Invalid Input', 'All threshold boundaries must be valid numbers.');
      return;
    }
    if (cl >= l || l >= hs || hs >= ch) {
      Alert.alert('Logical Sequence Error', 'Thresholds must satisfy: criticalLow < low < highStart < criticalHigh.');
      return;
    }

    updateSensorThresholds(editingSensor, {
      criticalLow: cl,
      low: l,
      highStart: hs,
      criticalHigh: ch,
      optimalMin: l,
      optimalMax: hs,
    });
    setEditingSensor(null);
    Alert.alert('Saved ✓', `${thresholds[editingSensor].label} thresholds updated successfully.`);
  };

  // Helper function to colorize card backgrounds and borders by level
  const getLevelColor = (level: string) => {
    switch (level) {
      case 'criticalLow':
      case 'criticalHigh':
        return colors.danger;
      case 'low':
      case 'high':
        return colors.warning;
      case 'ok':
      case 'recovery':
        return colors.healthy;
      case 'offline':
      default:
        return colors.offline;
    }
  };

  const getLevelLabel = (level: string) => {
    switch (level) {
      case 'criticalLow':
        return 'CRITICAL LOW';
      case 'criticalHigh':
        return 'CRITICAL HIGH';
      case 'low':
        return 'LOW WARNING';
      case 'high':
        return 'HIGH WARNING';
      case 'ok':
        return 'OPTIMAL';
      case 'recovery':
        return 'RECOVERED';
      case 'offline':
        return 'SENSOR OFFLINE';
      default:
        return 'INITIALIZING';
    }
  };

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts);
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  // Run mock value injection to test debounce, hysteresis, cooldown, and recovery
  const runSimulationTest = async (
    sensor: SensorType,
    value: number,
    label: string,
    stepCount: number = 3
  ) => {
    setIsSimulating(true);
    setSimulationLog(`Injecting ${stepCount} consecutive readings: ${label} (${value}${thresholds[sensor].unit})...`);

    // Simulate debounce consecutive readings
    for (let i = 1; i <= stepCount; i++) {
      await processSensorReading(sensor, value);
      setSimulationLog(`Dispatched reading ${i} of ${stepCount} (${label})`);
      if (i < stepCount) {
        await new Promise((res) => setTimeout(res, 200));
      }
    }

    setIsSimulating(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Mode Header & Switcher */}
      <View style={[styles.modeBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.modeInfo}>
          <Text style={[Typography.caption, { color: colors.textSecondary }]}>
            DISPATCH ENGINE
          </Text>
          <View style={styles.modeRow}>
            <View
              style={[
                styles.modeDot,
                {
                  backgroundColor:
                    notificationMode === 'local' ? colors.healthy : colors.warning,
                },
              ]}
            />
            <Text style={[Typography.bodyMedium, { color: colors.text, fontWeight: '700' }]}>
              {notificationMode === 'local' ? 'MODE: LOCAL (Expo Go Ready)' : 'MODE: PUSH (EAS Standalone)'}
            </Text>
          </View>
        </View>

        <Button
          title={notificationMode === 'local' ? 'Switch to Push' : 'Switch to Local'}
          variant="outline"
          size="sm"
          onPress={() => {
            const nextMode: NotificationMode = notificationMode === 'local' ? 'push' : 'local';
            setNotificationMode(nextMode);
            Alert.alert(
              `Mode Switched: ${nextMode.toUpperCase()}`,
              nextMode === 'local'
                ? 'Local mode fires immediate notifications on device via expo-notifications. 100% works in Expo Go.'
                : 'Push mode sends notifications via Expo Push API to cloud device tokens. Requires an EAS development build.'
            );
          }}
        />
      </View>

      {/* Navigation Sub-Tabs */}
      <View style={[styles.tabBar, { backgroundColor: colors.surfaceSubtle }]}>
        <Pressable
          onPress={() => setActiveTab('status')}
          style={[
            styles.tabItem,
            activeTab === 'status' && { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'status' ? colors.primary : colors.textSecondary },
              activeTab === 'status' && { fontWeight: '700' },
            ]}
          >
            📊 Live Monitor
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('history')}
          style={[
            styles.tabItem,
            activeTab === 'history' && { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'history' ? colors.primary : colors.textSecondary },
              activeTab === 'history' && { fontWeight: '700' },
            ]}
          >
            📋 Alert History ({alertHistory.filter((a) => !a.acknowledged).length})
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('settings')}
          style={[
            styles.tabItem,
            activeTab === 'settings' && { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'settings' ? colors.primary : colors.textSecondary },
              activeTab === 'settings' && { fontWeight: '700' },
            ]}
          >
            ⚙️ Threshold Rules
          </Text>
        </Pressable>
      </View>

      {/* TAB 1: LIVE MONITOR & SENSOR STATUS CARDS */}
      {activeTab === 'status' && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.xs }]}>
            Agricultural Crop Health
          </Text>
          <Text style={[Typography.caption, { color: colors.textSecondary, marginBottom: Spacing.md }]}>
            Continuous multi-tier threshold monitoring with 3-sample debounce & hysteresis stabilization.
          </Text>

          {/* SENSOR 1: SOIL MOISTURE */}
          {(() => {
            const sensor: SensorType = 'moisture';
            const cfg = thresholds[sensor];
            const state = sensorStates[sensor];
            const color = getLevelColor(state.currentLevel);
            const actionText =
              state.currentLevel === 'criticalLow'
                ? cfg.actions.criticalLow
                : state.currentLevel === 'low'
                  ? cfg.actions.low
                  : state.currentLevel === 'high'
                    ? cfg.actions.high
                    : state.currentLevel === 'criticalHigh'
                      ? cfg.actions.criticalHigh
                      : cfg.actions.recovery;

            return (
              <Card
                variant="outlined"
                style={[
                  styles.sensorCard,
                  { borderLeftWidth: 5, borderLeftColor: color },
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.sensorTitleGroup}>
                    <Text style={styles.sensorIcon}>💧</Text>
                    <View>
                      <Text style={[Typography.bodyMedium, { fontWeight: '700', color: colors.text }]}>
                        {cfg.label}
                      </Text>
                      <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                        Target band: {cfg.optimalMin}% - {cfg.optimalMax}%
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.levelBadge, { backgroundColor: color }]}>
                    <Text style={styles.levelBadgeText}>{getLevelLabel(state.currentLevel)}</Text>
                  </View>
                </View>

                <View style={styles.metricRow}>
                  <Text style={[styles.metricValue, { color: colors.text }]}>
                    {state.lastValue > 0 ? `${state.lastValue}%` : '--%'}
                  </Text>
                  <View style={styles.debounceBadge}>
                    <Text style={[styles.debounceText, { color: colors.textSecondary }]}>
                      Debounce: {state.consecutiveCount >= 3 ? 'Confirmed Active' : `${state.consecutiveCount}/3 readings`}
                    </Text>
                  </View>
                </View>

                {/* Actionable Agricultural Guidance Banner */}
                <View style={[styles.actionBanner, { backgroundColor: colors.surfaceSubtle }]}>
                  <Text style={[styles.actionHeader, { color }]}>
                    💡 RECOMMENDED ACTION:
                  </Text>
                  <Text style={[Typography.bodySmall, { color: colors.text, fontWeight: '600' }]}>
                    {actionText}
                  </Text>
                </View>
              </Card>
            );
          })()}

          {/* SENSOR 2: AIR TEMPERATURE */}
          {(() => {
            const sensor: SensorType = 'temperature';
            const cfg = thresholds[sensor];
            const state = sensorStates[sensor];
            const color = getLevelColor(state.currentLevel);
            const actionText =
              state.currentLevel === 'criticalLow'
                ? cfg.actions.criticalLow
                : state.currentLevel === 'low'
                  ? cfg.actions.low
                  : state.currentLevel === 'high'
                    ? cfg.actions.high
                    : state.currentLevel === 'criticalHigh'
                      ? cfg.actions.criticalHigh
                      : cfg.actions.recovery;

            return (
              <Card
                variant="outlined"
                style={[
                  styles.sensorCard,
                  { borderLeftWidth: 5, borderLeftColor: color },
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.sensorTitleGroup}>
                    <Text style={styles.sensorIcon}>🌡️</Text>
                    <View>
                      <Text style={[Typography.bodyMedium, { fontWeight: '700', color: colors.text }]}>
                        {cfg.label}
                      </Text>
                      <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                        Comfort band: {cfg.optimalMin}°C - {cfg.optimalMax}°C
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.levelBadge, { backgroundColor: color }]}>
                    <Text style={styles.levelBadgeText}>{getLevelLabel(state.currentLevel)}</Text>
                  </View>
                </View>

                <View style={styles.metricRow}>
                  <Text style={[styles.metricValue, { color: colors.text }]}>
                    {state.lastValue !== 0 ? `${state.lastValue}°C` : '--°C'}
                  </Text>
                  <View style={styles.debounceBadge}>
                    <Text style={[styles.debounceText, { color: colors.textSecondary }]}>
                      Debounce: {state.consecutiveCount >= 3 ? 'Confirmed Active' : `${state.consecutiveCount}/3 readings`}
                    </Text>
                  </View>
                </View>

                <View style={[styles.actionBanner, { backgroundColor: colors.surfaceSubtle }]}>
                  <Text style={[styles.actionHeader, { color }]}>
                    💡 RECOMMENDED ACTION:
                  </Text>
                  <Text style={[Typography.bodySmall, { color: colors.text, fontWeight: '600' }]}>
                    {actionText}
                  </Text>
                </View>
              </Card>
            );
          })()}

          {/* SENSOR 3: AIR HUMIDITY */}
          {(() => {
            const sensor: SensorType = 'humidity';
            const cfg = thresholds[sensor];
            const state = sensorStates[sensor];
            const color = getLevelColor(state.currentLevel);
            const actionText =
              state.currentLevel === 'criticalLow'
                ? cfg.actions.criticalLow
                : state.currentLevel === 'low'
                  ? cfg.actions.low
                  : state.currentLevel === 'high'
                    ? cfg.actions.high
                    : state.currentLevel === 'criticalHigh'
                      ? cfg.actions.criticalHigh
                      : cfg.actions.recovery;

            return (
              <Card
                variant="outlined"
                style={[
                  styles.sensorCard,
                  { borderLeftWidth: 5, borderLeftColor: color },
                ]}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.sensorTitleGroup}>
                    <Text style={styles.sensorIcon}>💨</Text>
                    <View>
                      <Text style={[Typography.bodyMedium, { fontWeight: '700', color: colors.text }]}>
                        {cfg.label}
                      </Text>
                      <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                        Target band: {cfg.optimalMin}% - {cfg.optimalMax}% RH
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.levelBadge, { backgroundColor: color }]}>
                    <Text style={styles.levelBadgeText}>{getLevelLabel(state.currentLevel)}</Text>
                  </View>
                </View>

                <View style={styles.metricRow}>
                  <Text style={[styles.metricValue, { color: colors.text }]}>
                    {state.lastValue > 0 ? `${state.lastValue}%` : '--%'}
                  </Text>
                  <View style={styles.debounceBadge}>
                    <Text style={[styles.debounceText, { color: colors.textSecondary }]}>
                      Debounce: {state.consecutiveCount >= 3 ? 'Confirmed Active' : `${state.consecutiveCount}/3 readings`}
                    </Text>
                  </View>
                </View>

                <View style={[styles.actionBanner, { backgroundColor: colors.surfaceSubtle }]}>
                  <Text style={[styles.actionHeader, { color }]}>
                    💡 RECOMMENDED ACTION:
                  </Text>
                  <Text style={[Typography.bodySmall, { color: colors.text, fontWeight: '600' }]}>
                    {actionText}
                  </Text>
                </View>
              </Card>
            );
          })()}

          {/* TEST PLAN & STRESS SIMULATOR ACCORDION */}
          <Card variant="outlined" style={[styles.simulatorBox, { borderColor: colors.border }]}>
            <Text style={[Typography.bodyMedium, { fontWeight: '700', color: colors.text, marginBottom: 4 }]}>
              🧪 Live Sensor Simulator & Engine Validator
            </Text>
            <Text style={[Typography.caption, { color: colors.textSecondary, marginBottom: Spacing.sm }]}>
              Inject simulated stress values to test notifications, debounce (3 readings), hysteresis, and recovery:
            </Text>

            {simulationLog ? (
              <View style={styles.simLogBox}>
                <Text style={styles.simLogText}>{simulationLog}</Text>
              </View>
            ) : null}

            <View style={styles.simButtonGrid}>
              <Button
                title="🚨 Critical Soil (10%)"
                variant="outline"
                size="sm"
                isLoading={isSimulating}
                onPress={() => runSimulationTest('moisture', 10, 'Critical Drought', 3)}
                style={styles.simBtn}
              />
              <Button
                title="💧 Low Soil (20%)"
                variant="outline"
                size="sm"
                isLoading={isSimulating}
                onPress={() => runSimulationTest('moisture', 20, 'Mild Dryness', 3)}
                style={styles.simBtn}
              />
              <Button
                title="🟢 Recover Soil (32%)"
                variant="secondary"
                size="sm"
                isLoading={isSimulating}
                onPress={() => runSimulationTest('moisture', 32, 'Optimal Loam Hydration', 1)}
                style={styles.simBtn}
              />
              <Button
                title="🔥 Heat Stress (36°C)"
                variant="outline"
                size="sm"
                isLoading={isSimulating}
                onPress={() => runSimulationTest('temperature', 36, 'Excessive Heat', 3)}
                style={styles.simBtn}
              />
              <Button
                title="❄️ Frost Anomaly (4°C)"
                variant="outline"
                size="sm"
                isLoading={isSimulating}
                onPress={() => runSimulationTest('temperature', 4, 'Freezing Risk', 3)}
                style={styles.simBtn}
              />
              <Button
                title="💨 Fungal Humidity (90%)"
                variant="outline"
                size="sm"
                isLoading={isSimulating}
                onPress={() => runSimulationTest('humidity', 90, 'Saturated Air', 3)}
                style={styles.simBtn}
              />
            </View>
          </Card>
        </ScrollView>
      )}

      {/* TAB 2: ALERT INCIDENT HISTORY */}
      {activeTab === 'history' && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.historyHeaderRow}>
            <View>
              <Text style={[Typography.h3, { color: colors.text }]}>Incident History</Text>
              <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                {alertHistory.length} total agricultural events logged
              </Text>
            </View>

            {alertHistory.length > 0 ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                  title="Acknowledge All"
                  variant="outline"
                  size="sm"
                  onPress={acknowledgeAllAlerts}
                />
                <Button
                  title="Clear"
                  variant="ghost"
                  size="sm"
                  onPress={clearAlertHistory}
                />
              </View>
            ) : null}
          </View>

          {alertHistory.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={{ fontSize: 44, marginBottom: Spacing.sm }}>🌿</Text>
              <Text style={[Typography.bodyMedium, { fontWeight: '700', color: colors.text }]}>
                No Active Alert Incidents
              </Text>
              <Text style={[Typography.caption, { color: colors.textSecondary, textAlign: 'center', marginTop: 4 }]}>
                All environmental metrics are within safe vegetative thresholds.
              </Text>
            </View>
          ) : (
            alertHistory.map((item) => {
              const color = getLevelColor(item.level);
              return (
                <Card
                  key={item.id}
                  variant="outlined"
                  style={[
                    styles.historyItemCard,
                    { borderLeftWidth: 4, borderLeftColor: color },
                    item.acknowledged && { opacity: 0.65 },
                  ]}
                >
                  <View style={styles.historyTopRow}>
                    <Text style={[styles.historyTitle, { color: colors.text }]}>
                      {item.title}
                    </Text>
                    <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                      {formatTimestamp(item.timestamp)}
                    </Text>
                  </View>

                  <Text style={[styles.historyActionText, { color: colors.textSecondary }]}>
                    {item.action}
                  </Text>

                  <View style={styles.historyBottomRow}>
                    <View style={[styles.historyBadge, { backgroundColor: color }]}>
                      <Text style={styles.historyBadgeText}>{getLevelLabel(item.level)}</Text>
                    </View>

                    {!item.acknowledged ? (
                      <Pressable
                        onPress={() => acknowledgeAlert(item.id)}
                        style={styles.ackBtn}
                      >
                        <Text style={[styles.ackBtnText, { color: colors.primary }]}>
                          ✓ Mark Acknowledged
                        </Text>
                      </Pressable>
                    ) : (
                      <Text style={[Typography.caption, { color: colors.healthy }]}>
                        ✓ Acknowledged
                      </Text>
                    )}
                  </View>
                </Card>
              );
            })
          )}
        </ScrollView>
      )}

      {/* TAB 3: THRESHOLD RULES & QUIET HOURS */}
      {activeTab === 'settings' && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.xs }]}>
            Monitoring Parameters
          </Text>
          <Text style={[Typography.caption, { color: colors.textSecondary, marginBottom: Spacing.md }]}>
            Customize biological limits and automated notifications per crop.
          </Text>

          {/* QUIET HOURS CARD */}
          <Card variant="outlined" style={[styles.settingsCard, { borderColor: colors.border }]}>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={[Typography.bodyMedium, { fontWeight: '700', color: colors.text }]}>
                  🌙 Quiet Hours Protection
                </Text>
                <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                  Suppress non-critical alerts between {quietHoursStart} and {quietHoursEnd}.
                </Text>
              </View>
              <Switch
                value={quietHoursEnabled}
                onValueChange={setQuietHoursEnabled}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>

            {quietHoursEnabled ? (
              <View style={[styles.quietHoursInputRow, { backgroundColor: colors.surfaceSubtle }]}>
                <View style={styles.timeInputBox}>
                  <Text style={[Typography.caption, { color: colors.textSecondary }]}>Starts At</Text>
                  <TextInput
                    style={[styles.timeInput, { color: colors.text, borderColor: colors.border }]}
                    value={quietHoursStart}
                    onChangeText={(val) => setQuietHoursTimes(val, quietHoursEnd)}
                    placeholder="22:00"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>

                <View style={styles.timeInputBox}>
                  <Text style={[Typography.caption, { color: colors.textSecondary }]}>Ends At</Text>
                  <TextInput
                    style={[styles.timeInput, { color: colors.text, borderColor: colors.border }]}
                    value={quietHoursEnd}
                    onChangeText={(val) => setQuietHoursTimes(quietHoursStart, val)}
                    placeholder="07:00"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              </View>
            ) : null}

            <View style={[styles.infoBanner, { backgroundColor: colors.surfaceSubtle }]}>
              <Text style={[Typography.caption, { color: colors.danger, fontWeight: '600' }]}>
                ⚠️ Safety Override: Critical alerts (freezing &lt;5°C, severe dehydration &lt;15%, waterlogging) always trigger regardless of quiet hours.
              </Text>
            </View>
          </Card>

          {/* PER-SENSOR ALERT TOGGLES */}
          <Card variant="outlined" style={[styles.settingsCard, { borderColor: colors.border }]}>
            <Text style={[Typography.bodyMedium, { fontWeight: '700', color: colors.text, marginBottom: Spacing.sm }]}>
              Sensor Channels
            </Text>

            <View style={styles.toggleRow}>
              <Text style={[Typography.body, { color: colors.text }]}>💧 Soil Moisture Alerts</Text>
              <Switch
                value={moistureAlertsEnabled}
                onValueChange={(v) => setSensorAlertToggle('moisture', v)}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
            <View style={styles.toggleRow}>
              <Text style={[Typography.body, { color: colors.text }]}>🌡️ Air Temperature Alerts</Text>
              <Switch
                value={temperatureAlertsEnabled}
                onValueChange={(v) => setSensorAlertToggle('temperature', v)}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
            <View style={styles.toggleRow}>
              <Text style={[Typography.body, { color: colors.text }]}>💨 Relative Humidity Alerts</Text>
              <Switch
                value={humidityAlertsEnabled}
                onValueChange={(v) => setSensorAlertToggle('humidity', v)}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
            <View style={styles.toggleRow}>
              <Text style={[Typography.body, { color: colors.text }]}>📶 Sensor Offline Alert (15m)</Text>
              <Switch
                value={offlineAlertsEnabled}
                onValueChange={(v) => setSensorAlertToggle('offline', v)}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            </View>
          </Card>

          {/* EDITABLE THRESHOLDS */}
          <Card variant="outlined" style={[styles.settingsCard, { borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm }}>
              <Text style={[Typography.bodyMedium, { fontWeight: '700', color: colors.text }]}>
                Crop Threshold Bands
              </Text>
              <Button
                title="Reset Defaults"
                variant="ghost"
                size="sm"
                onPress={() => {
                  resetThresholdsToDefault();
                  Alert.alert('Reset ✓', 'Thresholds restored to default agricultural values.');
                }}
              />
            </View>

            {(['moisture', 'temperature', 'humidity'] as SensorType[]).map((s) => {
              const cfg = thresholds[s];
              return (
                <View key={s} style={[styles.thresholdRowBox, { backgroundColor: colors.surfaceSubtle }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[Typography.bodySmall, { fontWeight: '700', color: colors.text }]}>
                      {cfg.label} ({cfg.unit})
                    </Text>
                    <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                      Crit: &lt;{cfg.criticalLow} | Warn: {cfg.low}–{cfg.highStart} | Crit: &gt;{cfg.criticalHigh}
                    </Text>
                  </View>

                  <Button
                    title="Edit ✏️"
                    variant="outline"
                    size="sm"
                    onPress={() => openThresholdEditor(s)}
                  />
                </View>
              );
            })}
          </Card>
        </ScrollView>
      )}

      {/* THRESHOLD EDITING MODAL */}
      <Modal visible={editingSensor !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[Typography.h3, { color: colors.text, marginBottom: 4 }]}>
              Edit {editingSensor ? thresholds[editingSensor].label : ''} Thresholds
            </Text>
            <Text style={[Typography.caption, { color: colors.textSecondary, marginBottom: Spacing.md }]}>
              Set the 4-tier boundaries ({editingSensor ? thresholds[editingSensor].unit : ''})
            </Text>

            <View style={styles.inputGroup}>
              <Text style={[Typography.caption, { color: colors.danger }]}>Critical Low (Emergency Irrigation/Frost)</Text>
              <TextInput
                style={[styles.modalInput, { color: colors.text, borderColor: colors.border }]}
                keyboardType="numeric"
                value={tempCritLow}
                onChangeText={setTempCritLow}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[Typography.caption, { color: colors.warning }]}>Low Warning (Early Action Band)</Text>
              <TextInput
                style={[styles.modalInput, { color: colors.text, borderColor: colors.border }]}
                keyboardType="numeric"
                value={tempLow}
                onChangeText={setTempLow}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[Typography.caption, { color: colors.warning }]}>High Warning (Ventilation/Delay Water)</Text>
              <TextInput
                style={[styles.modalInput, { color: colors.text, borderColor: colors.border }]}
                keyboardType="numeric"
                value={tempHighStart}
                onChangeText={setTempHighStart}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[Typography.caption, { color: colors.danger }]}>Critical High (Heat Stress/Waterlogging)</Text>
              <TextInput
                style={[styles.modalInput, { color: colors.text, borderColor: colors.border }]}
                keyboardType="numeric"
                value={tempCritHigh}
                onChangeText={setTempCritHigh}
              />
            </View>

            <View style={styles.modalBtnRow}>
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => setEditingSensor(null)}
              />
              <Button
                title="Save Changes"
                variant="primary"
                onPress={saveThresholds}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  modeBar: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  modeInfo: {
    flex: 1,
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  modeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  tabBar: {
    flexDirection: 'row',
    padding: 4,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.lg,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabText: {
    fontSize: 12,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  sensorCard: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  sensorTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sensorIcon: {
    fontSize: 26,
  },
  levelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  levelBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  metricValue: {
    fontSize: 32,
    fontWeight: '800',
  },
  debounceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  debounceText: {
    fontSize: 11,
    fontWeight: '600',
  },
  actionBanner: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.xs,
  },
  actionHeader: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  simulatorBox: {
    marginTop: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  simLogBox: {
    backgroundColor: '#0F172A',
    padding: 8,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  simLogText: {
    color: '#34D399',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  simButtonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  simBtn: {
    flexGrow: 1,
    minWidth: '45%',
  },
  historyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  emptyContainer: {
    padding: Spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyItemCard: {
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  historyTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  historyActionText: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  historyBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  historyBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  ackBtn: {
    padding: 4,
  },
  ackBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  settingsCard: {
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  quietHoursInputRow: {
    flexDirection: 'row',
    gap: 12,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.xs,
  },
  timeInputBox: {
    flex: 1,
  },
  timeInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    padding: 6,
    marginTop: 4,
    fontSize: 14,
    textAlign: 'center',
  },
  infoBanner: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  thresholdRowBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  inputGroup: {
    marginBottom: Spacing.sm,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: 8,
    marginTop: 4,
    fontSize: 14,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: Spacing.md,
  },
});
