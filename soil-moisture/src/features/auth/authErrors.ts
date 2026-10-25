/**
 * Authentication Error & Rate Limiting Utility
 * 
 * Normalizes Supabase GoTrue authentication errors into structured,
 * actionable user feedback with active countdown cooldowns and resolution guidance.
 */

export type AuthErrorKind =
  | 'RATE_LIMIT_EXCEEDED'
  | 'EMAIL_NOT_CONFIRMED'
  | 'EMAIL_PROVIDER_DISABLED'
  | 'INVALID_CREDENTIALS'
  | 'SCHEMA_DATABASE_ERROR'
  | 'USER_ALREADY_EXISTS'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export interface ParsedAuthError {
  kind: AuthErrorKind;
  title: string;
  message: string;
  actionHint?: string;
  suggestedCooldownSeconds?: number;
  rawMessage: string;
}

/**
 * Maps raw Supabase Auth errors or general exceptions into friendly, structured diagnostics.
 */
export function parseAuthError(error: unknown): ParsedAuthError {
  if (!error) {
    return {
      kind: 'UNKNOWN',
      title: 'Unknown Error',
      message: 'An unexpected error occurred. Please try again.',
      rawMessage: '',
    };
  }

  const errObj = typeof error === 'object' && error !== null ? (error as Record<string, any>) : {};
  const status = typeof errObj.status === 'number' ? errObj.status : undefined;
  const code = typeof errObj.code === 'string' ? errObj.code.toLowerCase() : '';
  const rawMessage = typeof errObj.message === 'string'
    ? errObj.message
    : typeof error === 'string'
    ? error
    : 'Unknown error occurred';

  const lowerMsg = rawMessage.toLowerCase();

  // 1. Rate Limiting (Supabase free tier 3-4 emails/hour cap)
  if (
    status === 429 ||
    code === 'over_email_send_rate_limit' ||
    lowerMsg.includes('rate limit') ||
    lowerMsg.includes('over_email_send_rate_limit') ||
    lowerMsg.includes('too many requests')
  ) {
    return {
      kind: 'RATE_LIMIT_EXCEEDED',
      title: 'Email Rate Limit Reached',
      message:
        'Supabase free-tier allows up to 3-4 verification emails per hour across the project. New email dispatches are temporarily held.',
      actionHint:
        'Please wait for the cooldown timer to expire, or ask the project admin to disable "Confirm email" or attach custom SMTP.',
      suggestedCooldownSeconds: 60,
      rawMessage,
    };
  }

  // 2. Email Not Confirmed
  if (
    code === 'email_not_confirmed' ||
    lowerMsg.includes('email not confirmed') ||
    lowerMsg.includes('confirm your email')
  ) {
    return {
      kind: 'EMAIL_NOT_CONFIRMED',
      title: 'Email Not Verified',
      message:
        'Your account was created, but your email address has not been confirmed yet.',
      actionHint:
        'Check your inbox/spam folder for the verification link, or request a new confirmation email below.',
      suggestedCooldownSeconds: 30,
      rawMessage,
    };
  }

  // 3. Email Provider or Signups Disabled
  if (
    code === 'email_provider_disabled' ||
    lowerMsg.includes('email signups are disabled') ||
    lowerMsg.includes('signups not allowed')
  ) {
    return {
      kind: 'EMAIL_PROVIDER_DISABLED',
      title: 'Signups Disabled',
      message:
        'Email registration is currently turned off in the project settings.',
      actionHint:
        'In Supabase Dashboard -> Authentication -> Providers -> Email, enable "Allow new users to sign up".',
      rawMessage,
    };
  }

  // 4. Invalid Credentials
  if (
    status === 400 &&
    (code === 'invalid_credentials' || lowerMsg.includes('invalid login credentials'))
  ) {
    return {
      kind: 'INVALID_CREDENTIALS',
      title: 'Invalid Credentials',
      message: 'The email address or password you entered is incorrect.',
      actionHint: 'Double check your spelling or use "Forgot password?" to reset it.',
      rawMessage,
    };
  }

  // 5. Database Schema / Identities Inconsistency (e.g. manual SQL user creation)
  if (
    status === 500 &&
    (lowerMsg.includes('database error querying schema') || lowerMsg.includes('querying schema'))
  ) {
    return {
      kind: 'SCHEMA_DATABASE_ERROR',
      title: 'Account Authentication Issue',
      message:
        'Supabase encountered an internal schema inconsistency for this user record (often caused by direct SQL inserts into auth.users without auth.identities).',
      actionHint:
        'Please create a new account through the Sign Up screen or re-create the user in Supabase Dashboard.',
      rawMessage,
    };
  }

  // 6. User Already Exists
  if (
    lowerMsg.includes('user already registered') ||
    lowerMsg.includes('already exists')
  ) {
    return {
      kind: 'USER_ALREADY_EXISTS',
      title: 'Account Already Exists',
      message: 'An account with this email address is already registered.',
      actionHint: 'Please sign in with your password or use password recovery.',
      rawMessage,
    };
  }

  // 7. Network / Connection Errors
  if (
    lowerMsg.includes('network request failed') ||
    lowerMsg.includes('failed to fetch') ||
    lowerMsg.includes('networkerror')
  ) {
    return {
      kind: 'NETWORK_ERROR',
      title: 'Connection Error',
      message: 'Unable to connect to the authentication server.',
      actionHint: 'Please check your internet connection and verify the backend URL.',
      rawMessage,
    };
  }

  // Fallback
  return {
    kind: 'UNKNOWN',
    title: 'Authentication Error',
    message: rawMessage || 'An unexpected error occurred during authentication.',
    rawMessage,
  };
}

/**
 * In-memory client-side rate limit throttle to prevent spamming Auth endpoints.
 */
class ClientRateLimiter {
  private timestamps: Map<string, number> = new Map();

  /**
   * Checks whether an action for a specific key (e.g. email or action name) is currently blocked.
   * Returns remaining seconds if blocked, or 0 if allowed.
   */
  getRemainingCooldown(key: string, cooldownSeconds: number = 30): number {
    const lastTime = this.timestamps.get(key);
    if (!lastTime) return 0;
    const elapsedSeconds = Math.floor((Date.now() - lastTime) / 1000);
    const remaining = cooldownSeconds - elapsedSeconds;
    return remaining > 0 ? remaining : 0;
  }

  /**
   * Records an attempt for the given key.
   */
  recordAttempt(key: string): void {
    this.timestamps.set(key, Date.now());
  }

  /**
   * Resets cooldown for a key.
   */
  reset(key: string): void {
    this.timestamps.delete(key);
  }
}

export const authRateLimiter = new ClientRateLimiter();
