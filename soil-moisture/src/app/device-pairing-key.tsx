import React, { useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { BorderRadius, Spacing, Typography } from '@/constants/theme';
import { useAppTheme } from '@/hooks/useAppTheme';

export default function DevicePairingKeyScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const params = useLocalSearchParams<{
    plantName?: string;
    deviceId?: string;
    deviceName?: string;
    plainSecret?: string;
  }>();

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const plantName = params.plantName || 'Plant';
  const deviceId = params.deviceId || '';
  const deviceName = params.deviceName || 'ESP32 Device';
  const plainSecret = params.plainSecret || '';

  const copyToClipboard = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const copyAllCredentials = async () => {
    const bundle = `// ESP32 Credentials for ${plantName}
const char* DEVICE_ID = "${deviceId}";
const char* DEVICE_SECRET = "${plainSecret}";`;
    await Clipboard.setStringAsync(bundle);
    setCopiedKey('all');
    setTimeout(() => setCopiedKey(null), 2500);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Success Hero */}
      <View style={styles.heroContainer}>
        <View style={[styles.checkCircle, { backgroundColor: colors.primaryLight }]}>
          <Text style={[styles.checkEmoji, { color: colors.primary }]}>✅</Text>
        </View>
        <Text style={[Typography.h2, { color: colors.text, marginTop: Spacing.md }]}>
          Device Provisioned
        </Text>
        <Text style={[Typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: 4 }]}>
          {deviceName} • Linked to <Text style={{ fontWeight: '700', color: colors.text }}>{plantName}</Text>
        </Text>
      </View>

      {/* Critical Security Warning Banner */}
      <View style={[styles.warningBox, { backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: colors.danger }]}>
        <Text style={[styles.warningTitle, { color: colors.danger }]}>
          ⚠️ READ CAREFULLY: ONE-TIME DISPLAY
        </Text>
        <Text style={[styles.warningBody, { color: colors.danger }]}>
          For hardware security, Supabase only stores the cryptographic SHA-256 hash of this key. This raw secret will NEVER be shown again.
        </Text>
      </View>

      {/* Device UUID */}
      <Card variant="outlined" style={styles.card}>
        <Text style={[Typography.caption, { color: colors.textSecondary }]}>
          DEVICE IDENTIFIER (x-device-id)
        </Text>
        <Text style={[styles.codeText, { color: colors.text }]} selectable>
          {deviceId}
        </Text>
        <Button
          title={copiedKey === 'id' ? 'Copied ID ✓' : 'Copy Device ID'}
          variant="secondary"
          size="sm"
          onPress={() => copyToClipboard(deviceId, 'id')}
          style={{ marginTop: Spacing.xs }}
        />
      </Card>

      {/* Raw Device Secret */}
      <Card variant="outlined" style={styles.card}>
        <Text style={[Typography.caption, { color: colors.textSecondary }]}>
          DEVICE SECRET (x-device-secret)
        </Text>
        <Text style={[styles.codeText, { color: colors.primary }]} selectable>
          {plainSecret}
        </Text>
        <Button
          title={copiedKey === 'secret' ? 'Copied Secret ✓' : 'Copy Secret Key'}
          variant="secondary"
          size="sm"
          onPress={() => copyToClipboard(plainSecret, 'secret')}
          style={{ marginTop: Spacing.xs }}
        />
      </Card>

      {/* Actions */}
      <Button
        title={copiedKey === 'all' ? 'Copied C++ Code ✓' : 'Copy ESP32 C++ Snippet'}
        variant="outline"
        size="md"
        onPress={copyAllCredentials}
        style={{ marginBottom: Spacing.sm }}
      />

      <Button
        title="I Have Saved My Secret — Return to Dashboard"
        variant="primary"
        size="lg"
        onPress={() => router.replace('/(tabs)')}
        style={{ marginBottom: Spacing.xl }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.md,
  },
  heroContainer: {
    alignItems: 'center',
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkEmoji: {
    fontSize: 32,
  },
  warningBox: {
    borderWidth: 1.5,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  warningTitle: {
    ...Typography.bodyMedium,
    fontWeight: '700',
    marginBottom: 4,
  },
  warningBody: {
    ...Typography.caption,
    lineHeight: 18,
  },
  card: {
    marginBottom: Spacing.md,
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    paddingVertical: Spacing.xs,
    letterSpacing: 0.5,
  },
});
