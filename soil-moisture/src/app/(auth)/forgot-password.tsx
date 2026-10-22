import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { BorderRadius, Spacing, Typography } from '@/constants/theme';
import { ResetPasswordSchema } from '@/features/auth/schemas';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useAuthStore } from '@/store/useAuthStore';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { resetPassword } = useAuthStore();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    const validation = ResetPasswordSchema.safeParse({ email });
    if (!validation.success) {
      setError(validation.error.issues[0]?.message || 'Invalid email');
      return;
    }

    setIsSubmitting(true);
    const { error: resetError } = await resetPassword(email);
    setIsSubmitting(false);

    if (resetError) {
      setError(resetError.message);
    } else {
      setSuccess(true);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Card variant="elevated" style={styles.card}>
          <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.xs }]}>
            Reset Password
          </Text>
          <Text style={[Typography.body, { color: colors.textSecondary, marginBottom: Spacing.lg }]}>
            Enter your account email to receive a password recovery link
          </Text>

          {error ? (
            <View style={[styles.banner, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
              <Text style={[styles.bannerText, { color: colors.danger }]}>{error}</Text>
            </View>
          ) : null}

          {success ? (
            <View style={[styles.banner, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
              <Text style={[styles.bannerText, { color: colors.healthy }]}>
                A password reset link has been dispatched to {email}. Check your inbox.
              </Text>
            </View>
          ) : (
            <>
              <Input
                label="Email Address"
                placeholder="demo@smartplant.io"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
              />

              <Button
                title="Send Recovery Link"
                onPress={handleSubmit}
                isLoading={isSubmitting}
                size="lg"
                style={{ marginTop: Spacing.sm }}
              />
            </>
          )}
        </Card>

        <View style={styles.footerRow}>
          <Pressable onPress={() => router.back()}>
            <Text style={[Typography.bodyMedium, { color: colors.primary }]}>
              ← Back to Sign In
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  banner: {
    padding: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  bannerText: {
    ...Typography.caption,
    fontWeight: '500',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
});
