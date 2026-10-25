# 📧 Supabase Email Rate Limiting & Production Upgrade Guide

This guide details how **Smart Flora** handles email rate limits, why they occur in Supabase, and how to upgrade your backend to production-grade custom SMTP for unlimited email dispatch at 0 cost.

---

## 1. Why Email Rate Limits Occur on Supabase Free Tier

By default, every Supabase project uses a shared, built-in SMTP mail service with a strict quota:
* **Rate Limit:** **3 to 4 emails per hour** across the entire project.
* **Scope:** Applies to any auth action triggering an email (User Sign-up confirmation, Password Reset, Magic Links, and Email Change).
* **HTTP Error Code:** **`429 Too Many Requests`**
* **Supabase Error Code:** **`over_email_send_rate_limit`**

When this quota is reached, any further user sign-up or password reset fails with:
`email rate limit exceeded`

---

## 2. In-App Defense Mechanisms (Implemented)

The mobile and web application implements layered client-side protections:

1. **Intelligent Auth Diagnostic Parser (`authErrors.ts`)**:
   - Intercepts raw GoTrue errors and classifies them into structured feedback:
     * `RATE_LIMIT_EXCEEDED` (HTTP 429)
     * `EMAIL_NOT_CONFIRMED`
     * `EMAIL_PROVIDER_DISABLED`
     * `INVALID_CREDENTIALS`
     * `SCHEMA_DATABASE_ERROR`
   - Replaces cryptic technical errors with actionable explanations and tips.

2. **Client-Side Cooldown Countdown Timers**:
   - When a rate limit or unconfirmed status is detected, the UI engages an active countdown timer (30s–60s).
   - Form submission buttons are disabled with remaining seconds displayed (`Please wait (XXs)`), preventing repeated hammering of the Supabase API.

3. **Direct Email Verification Recovery**:
   - If an unconfirmed user attempts to log in, the screen displays a dedicated **"Resend Verification Email"** action with rate-limit cooldown protection.

4. **Client-Side Action Throttle (`authRateLimiter`)**:
   - In-memory rate limiter tracks rapid submissions per email address to stop loops before they reach the cloud.

---

## 3. Permanent Fix: Connect Free Custom SMTP (Production)

To send thousands of verification emails without hitting the 3/hour ceiling, connect a dedicated transactional email provider to Supabase.

### Recommended Free Provider: **Resend** (3,000 emails/month free)

1. **Create Free Account:**
   - Go to [resend.com](https://resend.com) and sign up for a free account.
   - Go to **API Keys** &rarr; Click **Create API Key** (e.g. `supabase-auth`). Copy the key (starts with `re_...`).

2. **Add Credentials in Supabase Dashboard:**
   - Open your [Supabase Dashboard](https://supabase.com/dashboard).
   - Navigate to **Project Settings** &rarr; **Authentication**.
   - Scroll down to **SMTP Settings** and enable **"Enable Custom SMTP"**.
   - Enter the following parameters:
     * **Sender email**: `noreply@yourdomain.com` (or `onboarding@resend.dev` for testing)
     * **Sender name**: `Smart Flora Monitoring`
     * **Host**: `smtp.resend.com`
     * **Port**: `465` or `587`
     * **Username**: `resend`
     * **Password**: `re_your_api_key_here`
   - Click **Save**.

> 💡 **Other Supported Providers:** SendGrid (100/day free), Brevo/Sendinblue (300/day free), AWS SES ($0.10 / 1000 emails).

---

## 4. Development & Testing Option: Disable Email Confirmation

If you are developing locally or demonstrating the application and don't need real emails:

1. In Supabase Dashboard, go to **Authentication** &rarr; **Providers** &rarr; **Email**.
2. Toggle **"Confirm email"** to **OFF**.
3. Click **Save**.

**Result:**
* Users can sign up and are immediately authenticated into the dashboard.
* No emails are sent, completely avoiding the 3/hour rate limit.
