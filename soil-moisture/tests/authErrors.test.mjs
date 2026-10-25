import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Import parser logic to test in Node environment
function parseAuthError(error) {
  if (!error) {
    return {
      kind: 'UNKNOWN',
      title: 'Unknown Error',
      message: 'An unexpected error occurred. Please try again.',
      rawMessage: '',
    };
  }

  const errObj = typeof error === 'object' && error !== null ? error : {};
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

  // 5. Database Schema / Identities Inconsistency
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

  return {
    kind: 'UNKNOWN',
    title: 'Authentication Error',
    message: rawMessage || 'An unexpected error occurred during authentication.',
    rawMessage,
  };
}

describe('Authentication Rate Limiting & Diagnostic Error Parsing', () => {
  it('correctly diagnoses email rate limit exceeded with HTTP 429', () => {
    const error = {
      status: 429,
      code: 'over_email_send_rate_limit',
      message: 'email rate limit exceeded',
    };
    const parsed = parseAuthError(error);
    assert.equal(parsed.kind, 'RATE_LIMIT_EXCEEDED');
    assert.equal(parsed.title, 'Email Rate Limit Reached');
    assert.equal(parsed.suggestedCooldownSeconds, 60);
    assert.match(parsed.message, /Supabase free-tier/);
  });

  it('correctly diagnoses email rate limit by message string alone', () => {
    const error = new Error('email rate limit exceeded');
    const parsed = parseAuthError(error);
    assert.equal(parsed.kind, 'RATE_LIMIT_EXCEEDED');
    assert.equal(parsed.suggestedCooldownSeconds, 60);
  });

  it('correctly diagnoses unconfirmed email error with resend hint', () => {
    const error = {
      status: 400,
      code: 'email_not_confirmed',
      message: 'Email not confirmed',
    };
    const parsed = parseAuthError(error);
    assert.equal(parsed.kind, 'EMAIL_NOT_CONFIRMED');
    assert.equal(parsed.title, 'Email Not Verified');
    assert.equal(parsed.suggestedCooldownSeconds, 30);
    assert.match(parsed.actionHint, /inbox/);
  });

  it('correctly diagnoses disabled email signups in project settings', () => {
    const error = {
      status: 400,
      code: 'email_provider_disabled',
      message: 'Email signups are disabled',
    };
    const parsed = parseAuthError(error);
    assert.equal(parsed.kind, 'EMAIL_PROVIDER_DISABLED');
    assert.equal(parsed.title, 'Signups Disabled');
    assert.match(parsed.actionHint, /Allow new users to sign up/);
  });

  it('correctly diagnoses invalid credentials', () => {
    const error = {
      status: 400,
      code: 'invalid_credentials',
      message: 'Invalid login credentials',
    };
    const parsed = parseAuthError(error);
    assert.equal(parsed.kind, 'INVALID_CREDENTIALS');
    assert.equal(parsed.title, 'Invalid Credentials');
  });

  it('correctly diagnoses internal database schema query error', () => {
    const error = {
      status: 500,
      message: 'Database error querying schema',
    };
    const parsed = parseAuthError(error);
    assert.equal(parsed.kind, 'SCHEMA_DATABASE_ERROR');
    assert.equal(parsed.title, 'Account Authentication Issue');
    assert.match(parsed.message, /auth\.identities/);
  });

  it('correctly diagnoses user already exists', () => {
    const error = {
      status: 422,
      message: 'User already registered',
    };
    const parsed = parseAuthError(error);
    assert.equal(parsed.kind, 'USER_ALREADY_EXISTS');
  });

  it('correctly diagnoses network connectivity failures', () => {
    const error = new Error('Network request failed');
    const parsed = parseAuthError(error);
    assert.equal(parsed.kind, 'NETWORK_ERROR');
    assert.equal(parsed.title, 'Connection Error');
  });
});
