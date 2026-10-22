import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Spacing, Typography } from '@/constants/theme';
import { useCreatePlantMutation } from '@/features/plants/usePlants';
import { useAppTheme } from '@/hooks/useAppTheme';

export default function AddPlantScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();

  // Form State
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [minMoisture, setMinMoisture] = useState('30');
  const [maxMoisture, setMaxMoisture] = useState('80');
  const [minTemp, setMinTemp] = useState('15');
  const [maxTemp, setMaxTemp] = useState('35');
  const [minHum, setMinHum] = useState('40');
  const [maxHum, setMaxHum] = useState('85');
  const [intervalSec, setIntervalSec] = useState('300');

  const [errors, setErrors] = useState<{ name?: string; deviceName?: string; general?: string }>({});

  const createPlantMutation = useCreatePlantMutation((result) => {
    // Navigate to device pairing key reveal screen
    router.replace({
      pathname: '/device-pairing-key',
      params: {
        plantId: result.plantId,
        plantName: result.plantName,
        deviceId: result.deviceId,
        deviceName: result.deviceName,
        plainSecret: result.plainSecret,
      },
    });
  });

  const handleSubmit = () => {
    const newErrors: typeof errors = {};
    if (!name.trim()) newErrors.name = 'Plant name is required';
    if (!deviceName.trim()) newErrors.deviceName = 'Sensor device name is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    createPlantMutation.mutate({
      name: name.trim(),
      species: species.trim() || undefined,
      location_note: locationNote.trim() || undefined,
      photo_url: photoUrl.trim() || undefined,
      deviceName: deviceName.trim(),
      min_soil_moisture: Number(minMoisture) || 30,
      max_soil_moisture: Number(maxMoisture) || 80,
      min_temperature_c: Number(minTemp) || 15,
      max_temperature_c: Number(maxTemp) || 35,
      min_humidity_percent: Number(minHum) || 40,
      max_humidity_percent: Number(maxHum) || 85,
      reportingIntervalSeconds: Number(intervalSec) || 300,
    });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Plant Details Section */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          1. PLANT INFORMATION
        </Text>
        <Card variant="outlined" style={styles.card}>
          <Input
            label="Plant Name *"
            placeholder="e.g. Fiddle Leaf Fig"
            value={name}
            onChangeText={setName}
            error={errors.name}
          />
          <Input
            label="Species (Optional)"
            placeholder="e.g. Ficus lyrata"
            value={species}
            onChangeText={setSpecies}
          />
          <Input
            label="Location Note (Optional)"
            placeholder="e.g. Living room corner, south-facing"
            value={locationNote}
            onChangeText={setLocationNote}
          />
          <Input
            label="Photo URL (Optional)"
            placeholder="https://..."
            value={photoUrl}
            onChangeText={setPhotoUrl}
            autoCapitalize="none"
          />
        </Card>

        {/* Hardware Device Section */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          2. ESP32 HARDWARE SENSOR
        </Text>
        <Card variant="outlined" style={styles.card}>
          <Input
            label="Device Label *"
            placeholder="e.g. ESP32-LivingRoom-Node"
            value={deviceName}
            onChangeText={setDeviceName}
            error={errors.deviceName}
          />
          <Input
            label="Reporting Interval (Seconds)"
            placeholder="300"
            value={intervalSec}
            onChangeText={setIntervalSec}
            keyboardType="numeric"
          />
        </Card>

        {/* Health Threshold Bounds */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          3. TARGET HEALTH THRESHOLDS
        </Text>
        <Card variant="outlined" style={styles.card}>
          <View style={styles.row}>
            <View style={styles.halfCol}>
              <Input
                label="Min Moisture %"
                placeholder="30"
                value={minMoisture}
                onChangeText={setMinMoisture}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.halfCol}>
              <Input
                label="Max Moisture %"
                placeholder="80"
                value={maxMoisture}
                onChangeText={setMaxMoisture}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.halfCol}>
              <Input
                label="Min Temp (°C)"
                placeholder="15"
                value={minTemp}
                onChangeText={setMinTemp}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.halfCol}>
              <Input
                label="Max Temp (°C)"
                placeholder="35"
                value={maxTemp}
                onChangeText={setMaxTemp}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.halfCol}>
              <Input
                label="Min Humidity %"
                placeholder="40"
                value={minHum}
                onChangeText={setMinHum}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.halfCol}>
              <Input
                label="Max Humidity %"
                placeholder="85"
                value={maxHum}
                onChangeText={setMaxHum}
                keyboardType="numeric"
              />
            </View>
          </View>
        </Card>

        {createPlantMutation.isError ? (
          <Text style={[Typography.caption, { color: colors.danger, marginBottom: Spacing.sm }]}>
            {createPlantMutation.error instanceof Error
              ? createPlantMutation.error.message
              : 'Failed to pair plant and device'}
          </Text>
        ) : null}

        <Button
          title="Save Plant & Generate Device Key"
          onPress={handleSubmit}
          isLoading={createPlantMutation.isPending}
          size="lg"
          style={{ marginBottom: Spacing.xl }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.md,
  },
  sectionTitle: {
    ...Typography.caption,
    fontWeight: '700',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    marginLeft: 4,
  },
  card: {
    marginBottom: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  halfCol: {
    flex: 1,
  },
});
