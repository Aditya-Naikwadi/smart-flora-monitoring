import React, { useEffect, useState } from 'react';
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
import { authRateLimiter, parseAuthError, ParsedAuthError } from '@/features/auth/authErrors';
import { ResetPasswordSchema } from '@/features/auth/schemas';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useAuthStore } from '@/store/useAuthStore';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { resetPassword } = useAuthStore();

  const [email, setEmail] = useState('');
  const [authDiagnostic, setAuthDiagnostic] = useState<ParsedAuthError | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);

  // Active cooldown countdown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const handleSubmit = async () => {
    setAuthDiagnostic(null);

    // 1. Client-side throttle
    const remainingCooldown = authRateLimiter.getRemainingCooldown(`reset_${email.trim()}`, 60);
    if (remainingCooldown > 0) {
      setCooldownSeconds(remainingCooldown);
      setAuthDiagnostic({
        kind: 'RATE_LIMIT_EXCEEDED',
        title: 'Action Cooldown Active',
        message: `Please wait ${remainingCooldown}s before requesting another password reset email.`,
        suggestedCooldownSeconds: remainingCooldown,
        rawMessage: 'Client-side throttle active',
      });
      return;
    }

    const validation = ResetPasswordSchema.safeParse({ email });
    if (!validation.success) {
      setAuthDiagnostic({
        kind: 'UNKNOWN',
        title: 'Validation Error',
        message: validation.error.issues[0]?.message || 'Please enter a valid email address',
        rawMessage: 'Validation Error',
      });
      return;
    }

    authRateLimiter.recordAttempt(`reset_${email.trim()}`);
    setIsSubmitting(true);
    const { error: resetError } = await resetPassword(email);
    setIsSubmitting(false);

    if (resetError) {
      const parsed = parseAuthError(resetError);
      setAuthDiagnostic(parsed);
      if (parsed.suggestedCooldownSeconds) {
        setCooldownSeconds(parsed.suggestedCooldownSeconds);
      }
    } else {
      setSuccess(true);
      setCooldownSeconds(60);
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

          {authDiagnostic ? (
            <View
              style={[
                styles.diagnosticCard,
                {
                  backgroundColor:
                    authDiagnostic.kind === 'RATE_LIMIT_EXCEEDED'
                      ? 'rgba(234, 179, 8, 0.12)'
                      : 'rgba(239, 68, 68, 0.1)',
                  borderColor:
                    authDiagnostic.kind === 'RATE_LIMIT_EXCEEDED'
                      ? 'rgba(234, 179, 8, 0.4)'
                      : 'rgba(239, 68, 68, 0.3)',
                },
              ]}
            >
              <View style={styles.diagnosticHeader}>
                <Text style={styles.diagnosticIcon}>
                  {authDiagnostic.kind === 'RATE_LIMIT_EXCEEDED' ? '⏳' : '⚠️'}
                </Text>
                <Text
                  style={[
                    styles.diagnosticTitle,
                    {
                      color:
                        authDiagnostic.kind === 'RATE_LIMIT_EXCEEDED'
                          ? '#ca8a04'
                          : colors.danger,
                    },
                  ]}
                >
                  {authDiagnostic.title}
                </Text>
              </View>

              <Text style={[styles.diagnosticMessage, { color: colors.text }]}>
                {authDiagnostic.message}
              </Text>

              {authDiagnostic.actionHint ? (
                <Text style={[styles.diagnosticHint, { color: colors.textSecondary }]}>
                  💡 {authDiagnostic.actionHint}
                </Text>
              ) : null}

              {cooldownSeconds > 0 ? (
                <View style={styles.cooldownBadge}>
                  <Text style={styles.cooldownText}>
                    Cooldown: retry available in {cooldownSeconds}s
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {success ? (
            <View
              style={[
                styles.diagnosticCard,
                {
                  backgroundColor: 'rgba(34, 197, 94, 0.12)',
                  borderColor: 'rgba(34, 197, 94, 0.3)',
                },
              ]}
            >
              <Text style={[styles.diagnosticTitle, { color: '#16a34a', marginBottom: 4 }]}>
                ✓ Reset Link Sent
              </Text>
              <Text style={[styles.diagnosticMessage, { color: colors.text }]}>
                A password recovery link has been dispatched to {email}. Check your inbox and spam folder.
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
                title={
                  cooldownSeconds > 0
                    ? `Please wait (${cooldownSeconds}s)`
                    : 'Send Recovery Link'
                }
                onPress={handleSubmit}
                isLoading={isSubmitting}
                disabled={cooldownSeconds > 0}
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
  diagnosticCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  diagnosticHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  diagnosticIcon: {
    fontSize: 18,
    marginRight: Spacing.xs,
  },
  diagnosticTitle: {
    ...Typography.bodyMedium,
    fontWeight: '700',
  },
  diagnosticMessage: {
    ...Typography.body,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: Spacing.xs,
  },
  diagnosticHint: {
    ...Typography.caption,
    fontSize: 12,
    marginTop: Spacing.xs,
  },
  cooldownBadge: {
    marginTop: Spacing.xs,
    paddingVertical: 4,
    paddingHorizontal: Spacing.xs,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: BorderRadius.sm,
    alignSelf: 'flex-start',
  },
  cooldownText: {
    ...Typography.caption,
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
});
