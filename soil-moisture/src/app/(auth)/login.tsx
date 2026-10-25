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
import { LoginSchema } from '@/features/auth/schemas';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useAuthStore } from '@/store/useAuthStore';

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { signIn, resendConfirmation, isLoading } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [authDiagnostic, setAuthDiagnostic] = useState<ParsedAuthError | null>(null);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
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

  const handleLogin = async () => {
    setErrors({});
    setAuthDiagnostic(null);
    setResendStatus(null);

    // 1. Client-Side Throttle Check
    const remainingCooldown = authRateLimiter.getRemainingCooldown(`login_${email.trim()}`, 15);
    if (remainingCooldown > 0) {
      setCooldownSeconds(remainingCooldown);
      setAuthDiagnostic({
        kind: 'RATE_LIMIT_EXCEEDED',
        title: 'Action Cooldown Active',
        message: `Please wait ${remainingCooldown}s before submitting again.`,
        suggestedCooldownSeconds: remainingCooldown,
        rawMessage: 'Client-side throttle active',
      });
      return;
    }

    const validation = LoginSchema.safeParse({ email, password });
    if (!validation.success) {
      const fieldErrors: { email?: string; password?: string } = {};
      for (const issue of validation.error.issues) {
        if (issue.path[0] === 'email') fieldErrors.email = issue.message;
        if (issue.path[0] === 'password') fieldErrors.password = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    authRateLimiter.recordAttempt(`login_${email.trim()}`);

    const { error } = await signIn(email, password);
    if (error) {
      const parsed = parseAuthError(error);
      setAuthDiagnostic(parsed);
      if (parsed.suggestedCooldownSeconds) {
        setCooldownSeconds(parsed.suggestedCooldownSeconds);
      }
    } else {
      router.replace('/(tabs)');
    }
  };

  const handleResendConfirmation = async () => {
    if (!email.trim()) {
      setErrors({ email: 'Please provide your email address' });
      return;
    }

    const remainingCooldown = authRateLimiter.getRemainingCooldown(`resend_${email.trim()}`, 60);
    if (remainingCooldown > 0) {
      setCooldownSeconds(remainingCooldown);
      return;
    }

    setIsResending(true);
    setResendStatus(null);
    authRateLimiter.recordAttempt(`resend_${email.trim()}`);

    const { error } = await resendConfirmation(email);
    setIsResending(false);

    if (error) {
      const parsed = parseAuthError(error);
      setAuthDiagnostic(parsed);
      if (parsed.suggestedCooldownSeconds) {
        setCooldownSeconds(parsed.suggestedCooldownSeconds);
      }
    } else {
      setResendStatus('Verification email dispatched! Please check your inbox and spam folder.');
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
        {/* Brand Banner */}
        <View style={styles.brandContainer}>
          <View style={[styles.logoBadge, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.logoIcon, { color: colors.primary }]}>🌿</Text>
          </View>
          <Text style={[Typography.h1, { color: colors.text, marginTop: Spacing.md }]}>
            Smart Flora
          </Text>
          <Text style={[Typography.body, { color: colors.textSecondary, marginTop: Spacing.xs }]}>
            Monitor your plants in real-time from anywhere
          </Text>
        </View>

        {/* Login Form Card */}
        <Card variant="elevated" style={styles.card}>
          <Text style={[Typography.h3, { color: colors.text, marginBottom: Spacing.md }]}>
            Sign In
          </Text>

          {/* Structured Auth Diagnostic Banner */}
          {authDiagnostic ? (
            <View
              style={[
                styles.diagnosticCard,
                {
                  backgroundColor:
                    authDiagnostic.kind === 'RATE_LIMIT_EXCEEDED'
                      ? 'rgba(234, 179, 8, 0.12)'
                      : authDiagnostic.kind === 'EMAIL_NOT_CONFIRMED'
                      ? 'rgba(59, 130, 246, 0.1)'
                      : 'rgba(239, 68, 68, 0.1)',
                  borderColor:
                    authDiagnostic.kind === 'RATE_LIMIT_EXCEEDED'
                      ? 'rgba(234, 179, 8, 0.4)'
                      : authDiagnostic.kind === 'EMAIL_NOT_CONFIRMED'
                      ? 'rgba(59, 130, 246, 0.3)'
                      : 'rgba(239, 68, 68, 0.3)',
                },
              ]}
            >
              <View style={styles.diagnosticHeader}>
                <Text style={styles.diagnosticIcon}>
                  {authDiagnostic.kind === 'RATE_LIMIT_EXCEEDED'
                    ? '⏳'
                    : authDiagnostic.kind === 'EMAIL_NOT_CONFIRMED'
                    ? '📬'
                    : '⚠️'}
                </Text>
                <Text
                  style={[
                    styles.diagnosticTitle,
                    {
                      color:
                        authDiagnostic.kind === 'RATE_LIMIT_EXCEEDED'
                          ? '#ca8a04'
                          : authDiagnostic.kind === 'EMAIL_NOT_CONFIRMED'
                          ? '#2563eb'
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

              {/* Action Button for Unconfirmed Email */}
              {authDiagnostic.kind === 'EMAIL_NOT_CONFIRMED' ? (
                <View style={{ marginTop: Spacing.sm }}>
                  <Button
                    title={
                      cooldownSeconds > 0
                        ? `Resend available in ${cooldownSeconds}s`
                        : 'Resend Verification Email'
                    }
                    variant="outline"
                    size="sm"
                    onPress={handleResendConfirmation}
                    isLoading={isResending}
                    disabled={cooldownSeconds > 0}
                  />
                </View>
              ) : null}

              {cooldownSeconds > 0 && authDiagnostic.kind !== 'EMAIL_NOT_CONFIRMED' ? (
                <View style={styles.cooldownBadge}>
                  <Text style={styles.cooldownText}>
                    Cooldown: retry available in {cooldownSeconds}s
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Resend Confirmation Success */}
          {resendStatus ? (
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
                ✓ Sent
              </Text>
              <Text style={[styles.diagnosticMessage, { color: colors.text }]}>
                {resendStatus}
              </Text>
            </View>
          ) : null}

          <Input
            label="Email Address"
            placeholder="demo@smartplant.io"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            error={errors.email}
          />

          <Input
            label="Password"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            isPassword
            error={errors.password}
          />

          <Pressable
            onPress={() => router.push('/(auth)/forgot-password')}
            style={styles.forgotBtn}
          >
            <Text style={[Typography.caption, { color: colors.primary, fontWeight: '600' }]}>
              Forgot password?
            </Text>
          </Pressable>

          <Button
            title={
              cooldownSeconds > 0 && authDiagnostic?.kind === 'RATE_LIMIT_EXCEEDED'
                ? `Please wait (${cooldownSeconds}s)`
                : 'Sign In'
            }
            onPress={handleLogin}
            isLoading={isLoading}
            disabled={cooldownSeconds > 0 && authDiagnostic?.kind === 'RATE_LIMIT_EXCEEDED'}
            size="lg"
            style={{ marginTop: Spacing.sm }}
          />
        </Card>

        {/* Footer Navigation to Sign Up */}
        <View style={styles.footerRow}>
          <Text style={[Typography.body, { color: colors.textSecondary }]}>
            Don&apos;t have an account?{' '}
          </Text>
          <Pressable onPress={() => router.push('/(auth)/register')}>
            <Text style={[Typography.bodyMedium, { color: colors.primary }]}>
              Sign Up
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
  brandContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIcon: {
    fontSize: 32,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginBottom: Spacing.md,
    marginTop: -Spacing.xs,
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
