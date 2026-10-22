import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { BorderRadius, Spacing, Typography } from '@/constants/theme';
import { Plant } from '@/features/plants/api';
import { useUpdatePlantThresholds } from '@/features/plants/useUpdatePlantThresholds';
import { useAppTheme } from '@/hooks/useAppTheme';

interface ThresholdEditorModalProps {
  plant: Plant;
  visible: boolean;
  onClose: () => void;
}

export function ThresholdEditorModal({
  plant,
  visible,
  onClose,
}: ThresholdEditorModalProps) {
  const { colors } = useAppTheme();

  const [minMoisture, setMinMoisture] = useState(String(plant.min_soil_moisture));
  const [maxMoisture, setMaxMoisture] = useState(String(plant.max_soil_moisture));
  const [minTemp, setMinTemp] = useState(String(plant.min_temperature_c));
  const [maxTemp, setMaxTemp] = useState(String(plant.max_temperature_c));
  const [minHum, setMinHum] = useState(String(plant.min_humidity_percent));
  const [maxHum, setMaxHum] = useState(String(plant.max_humidity_percent));
  const [cooldown, setCooldown] = useState(String(plant.alert_cooldown_minutes));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const updateMutation = useUpdatePlantThresholds(() => {
    onClose();
  });

  const handleSave = () => {
    setErrorMsg(null);
    const minM = parseFloat(minMoisture);
    const maxM = parseFloat(maxMoisture);
    const minT = parseFloat(minTemp);
    const maxT = parseFloat(maxTemp);
    const minH = parseFloat(minHum);
    const maxH = parseFloat(maxHum);
    const cd = parseInt(cooldown, 10);

    if (isNaN(minM) || isNaN(maxM) || minM >= maxM || minM < 0 || maxM > 100) {
      setErrorMsg('Soil moisture must be between 0-100% and Min must be strictly less than Max.');
      return;
    }
    if (isNaN(minT) || isNaN(maxT) || minT >= maxT) {
      setErrorMsg('Min temperature must be strictly less than Max temperature.');
      return;
    }
    if (isNaN(minH) || isNaN(maxH) || minH >= maxH || minH < 0 || maxH > 100) {
      setErrorMsg('Humidity must be between 0-100% and Min must be strictly less than Max.');
      return;
    }
    if (isNaN(cd) || cd < 5 || cd > 1440) {
      setErrorMsg('Cooldown must be between 5 and 1440 minutes (24h).');
      return;
    }

    updateMutation.mutate({
      plantId: plant.id,
      min_soil_moisture: minM,
      max_soil_moisture: maxM,
      min_temperature_c: minT,
      max_temperature_c: maxT,
      min_humidity_percent: minH,
      max_humidity_percent: maxH,
      alert_cooldown_minutes: cd,
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
          <ScrollView contentContainerStyle={styles.scrollInner}>
            <View style={styles.headerRow}>
              <View>
                <Text style={[Typography.h3, { color: colors.text }]}>
                  Edit Target Thresholds
                </Text>
                <Text style={[Typography.caption, { color: colors.textSecondary }]}>
                  {plant.name}
                </Text>
              </View>
              <Button title="✕ Close" variant="ghost" size="sm" onPress={onClose} />
            </View>

            {errorMsg ? (
              <View style={[styles.errorBanner, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                <Text style={[Typography.caption, { color: colors.danger }]}>{errorMsg}</Text>
              </View>
            ) : null}

            {/* Soil Moisture */}
            <Card variant="outlined" style={styles.card}>
              <Text style={[styles.cardTitle, { color: colors.moisture }]}>
                💧 Soil Moisture Thresholds (%)
              </Text>
              <View style={styles.row}>
                <View style={styles.halfCol}>
                  <Input
                    label="Min Soil %"
                    value={minMoisture}
                    onChangeText={setMinMoisture}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.halfCol}>
                  <Input
                    label="Max Soil %"
                    value={maxMoisture}
                    onChangeText={setMaxMoisture}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </Card>

            {/* Temperature */}
            <Card variant="outlined" style={styles.card}>
              <Text style={[styles.cardTitle, { color: colors.temperature }]}>
                🌡️ Temperature Thresholds (°C)
              </Text>
              <View style={styles.row}>
                <View style={styles.halfCol}>
                  <Input
                    label="Min Temp °C"
                    value={minTemp}
                    onChangeText={setMinTemp}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.halfCol}>
                  <Input
                    label="Max Temp °C"
                    value={maxTemp}
                    onChangeText={setMaxTemp}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </Card>

            {/* Humidity */}
            <Card variant="outlined" style={styles.card}>
              <Text style={[styles.cardTitle, { color: colors.humidity }]}>
                💨 Relative Humidity Thresholds (%)
              </Text>
              <View style={styles.row}>
                <View style={styles.halfCol}>
                  <Input
                    label="Min Humidity %"
                    value={minHum}
                    onChangeText={setMinHum}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.halfCol}>
                  <Input
                    label="Max Humidity %"
                    value={maxHum}
                    onChangeText={setMaxHum}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </Card>

            {/* Alert Cooldown */}
            <Card variant="outlined" style={styles.card}>
              <Text style={[styles.cardTitle, { color: colors.textSecondary }]}>
                ⏱️ Alert Throttle & Cooldown
              </Text>
              <Input
                label="Cooldown Minutes between alerts"
                value={cooldown}
                onChangeText={setCooldown}
                keyboardType="numeric"
              />
            </Card>

            <Button
              title="Save Threshold Updates"
              onPress={handleSave}
              isLoading={updateMutation.isPending}
              size="lg"
              style={{ marginTop: Spacing.sm }}
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    maxHeight: '85%',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
  },
  scrollInner: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  card: {
    marginBottom: Spacing.md,
    padding: Spacing.sm + 4,
  },
  cardTitle: {
    ...Typography.bodyMedium,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  halfCol: {
    flex: 1,
  },
  errorBanner: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
});
