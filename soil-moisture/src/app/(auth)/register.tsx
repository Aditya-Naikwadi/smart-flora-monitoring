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
import { RegisterSchema } from '@/features/auth/schemas';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useAuthStore } from '@/store/useAuthStore';

export default function RegisterScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { signUp, isLoading } = useAuthStore();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  const [authDiagnostic, setAuthDiagnostic] = useState<ParsedAuthError | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
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

  const handleRegister = async () => {
    setErrors({});
    setAuthDiagnostic(null);
    setSuccessMessage(null);

    // 1. Client-Side Rate Limit Check
    const remainingCooldown = authRateLimiter.getRemainingCooldown(`register_${email.trim()}`, 30);
    if (remainingCooldown > 0) {
      setCooldownSeconds(remainingCooldown);
      setAuthDiagnostic({
        kind: 'RATE_LIMIT_EXCEEDED',
        title: 'Action Cooldown Active',
        message: `Please wait ${remainingCooldown}s before making another registration request.`,
        suggestedCooldownSeconds: remainingCooldown,
        rawMessage: 'Client-side rate limit throttle active',
      });
      return;
    }

    // 2. Validate input schema
    const validation = RegisterSchema.safeParse({
      fullName,
      email,
      password,
      confirmPassword,
    });

    if (!validation.success) {
      const fieldErrors: typeof errors = {};
      for (const issue of validation.error.issues) {
        const field = issue.path[0] as keyof typeof errors;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    // Record attempt for client-side rate limiting
    authRateLimiter.recordAttempt(`register_${email.trim()}`);

    // 3. Dispatch Supabase registration
    const { error, session } = await signUp(email, password, fullName);
    if (error) {
      const parsed = parseAuthError(error);
      setAuthDiagnostic(parsed);
      if (parsed.suggestedCooldownSeconds) {
        setCooldownSeconds(parsed.suggestedCooldownSeconds);
      }
    } else if (session) {
      router.replace('/(tabs)');
    } else {
      setSuccessMessage(
        `Account successfully registered! A verification link has been sent to ${email.trim()}. Please verify your email before signing in.`
      );
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
            Create an Account
          </Text>
          <Text style={[Typography.body, { color: colors.textSecondary, marginBottom: Spacing.lg }]}>
            Join to monitor soil, temperature, and get push alerts
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

          {/* Success Banner */}
          {successMessage ? (
            <View
              style={[
                styles.diagnosticCard,
                {
                  backgroundColor: 'rgba(34, 197, 94, 0.12)',
                  borderColor: 'rgba(34, 197, 94, 0.3)',
                },
              ]}
            >
              <Text style={[styles.diagnosticTitle, { color: '#16a34a', marginBottom: Spacing.xs }]}>
                ✓ Verification Email Sent
              </Text>
              <Text style={[styles.diagnosticMessage, { color: colors.text }]}>
                {successMessage}
              </Text>
              <Button
                title="Go to Sign In"
                variant="outline"
                size="sm"
                onPress={() => router.replace('/(auth)/login')}
                style={{ marginTop: Spacing.sm }}
              />
            </View>
          ) : null}

          <Input
            label="Full Name"
            placeholder="Jane Doe"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            error={errors.fullName}
          />

          <Input
            label="Email Address"
            placeholder="jane@example.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
            error={errors.email}
          />

          <Input
            label="Password (min 6 characters)"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            isPassword
            error={errors.password}
          />

          <Input
            label="Confirm Password"
            placeholder="••••••••"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            isPassword
            error={errors.confirmPassword}
          />

          <Button
            title={
              cooldownSeconds > 0
                ? `Please wait (${cooldownSeconds}s)`
                : 'Create Account'
            }
            onPress={handleRegister}
            isLoading={isLoading}
            disabled={cooldownSeconds > 0}
            size="lg"
            style={{ marginTop: Spacing.sm }}
          />
        </Card>

        <View style={styles.footerRow}>
          <Text style={[Typography.body, { color: colors.textSecondary }]}>
            Already have an account?{' '}
          </Text>
          <Pressable onPress={() => router.back()}>
            <Text style={[Typography.bodyMedium, { color: colors.primary }]}>
              Sign In
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
