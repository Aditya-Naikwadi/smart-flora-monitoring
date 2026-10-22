# 🚀 Cloud Deployment & Standalone Build Guide

This comprehensive guide covers deploying **Smart Flora** completely on **free tiers** (0 credit card required, 100% free forever within standard project limits).

---

## 📑 Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [Supabase Cloud Setup (Free Tier)](#2-supabase-cloud-setup-free-tier)
3. [Deploying Database Migrations & Retention Engine](#3-deploying-database-migrations--retention-engine)
4. [Deploying Supabase Edge Functions](#4-deploying-supabase-edge-functions)
5. [Configuring Alert Dispatcher Webhook](#5-configuring-alert-dispatcher-webhook)
6. [Configuring Automated pg_cron Jobs](#6-configuring-automated-pg_cron-jobs)
7. [Building Standalone Android APK with Expo EAS (Free Tier)](#7-building-standalone-android-apk-with-expo-eas-free-tier)
8. [Deploying Web Dashboard (Vercel / Netlify)](#8-deploying-web-dashboard-vercel--netlify)

---

## 1. Prerequisites

Make sure the following tools are installed on your machine:
* **Node.js** v18+ (Node 22 LTS recommended)
* **Git**
* **Supabase CLI**:
  ```bash
  npm install -g supabase
  ```
* **Expo EAS CLI**:
  ```bash
  npm install -g eas-cli
  ```

---

## 2. Supabase Cloud Setup (Free Tier)

1. Go to [database.new](https://database.new) and log in with your GitHub account.
2. Click **New Project**:
   * **Project Name**: `smart-flora-iot`
   * **Database Password**: Choose a strong password and save it securely.
   * **Region**: Select the region closest to you (e.g., `us-east-1`, `eu-central-1`, or `ap-south-1`).
   * **Pricing Plan**: Select **Free Plan ($0/month)**.
3. Once the database finishes provisioning (approx. 2 minutes), navigate to **Project Settings** ➔ **API**:
   * Copy the **Project URL** (e.g., `https://xyzprojectid.supabase.co`).
   * Copy the **`anon` `public` API Key**.
   * Copy the **`service_role` Secret API Key** (keep this secret; only used by Edge Functions).

---

## 3. Deploying Database Migrations & Retention Engine

1. Authenticate the Supabase CLI in your local terminal:
   ```bash
   supabase login
   ```
2. Link your local project to your new cloud project:
   ```bash
   supabase link --project-ref <YOUR_PROJECT_REF_ID>
   ```
   *(Your project ref is the subdomain from your project URL, e.g., `xyzprojectid` in `https://xyzprojectid.supabase.co`)*.
3. Push all migrations to your cloud database:
   ```bash
   supabase db push
   ```
   This automatically creates:
   * Tables: `profiles`, `plants`, `devices`, `readings`, `hourly_readings`, `alerts`
   * Row Level Security (RLS) policies
   * Pairing RPC function: `pair_device(...)`
   * Downsampling procedure: `rollup_and_purge_readings()`
   * Alert triggers: `check_reading_thresholds()`
   * Offline checker: `check_offline_devices()`

4. *(Optional)* Seed initial plant types and demo data:
   ```bash
   # In Supabase Cloud Dashboard -> SQL Editor, copy and run the contents of:
   # supabase/seed.sql
   ```

---

## 4. Deploying Supabase Edge Functions

Smart Flora utilizes two serverless Deno Edge Functions on the Supabase Free Plan (up to 500,000 invocations/month).

### 1. Ingest Function (`ingest`)
Receives telemetry from ESP32, verifies the SHA-256 HMAC secret in constant time, enforces rate-limiting, and writes to `readings`.

```bash
supabase functions deploy ingest --no-verify-jwt
```
*(The `--no-verify-jwt` flag is required because microcontrollers authenticate with a pre-shared hardware secret header rather than a user JWT).*

### 2. Alert Dispatcher Function (`alert-dispatcher`)
Listens to database alert events and calls the Expo Push Notification API.

```bash
supabase functions deploy alert-dispatcher
```

---

## 5. Configuring Alert Dispatcher Webhook

To automatically notify the user whenever an incident is triggered by Postgres:

1. Open your **Supabase Cloud Dashboard**.
2. Go to **Database** ➔ **Webhooks** ➔ Click **Create a new hook**.
3. Fill in the details:
   * **Name**: `on_alert_created`
   * **Table**: `public.alerts`
   * **Events**: Check **Insert** only
   * **Type of webhook**: **Supabase Edge Functions**
   * **Edge Function**: Select `alert-dispatcher`
   * **HTTP Method**: `POST`
4. Click **Save Webhook**.

Now, whenever soil moisture drops below threshold or heat spikes, Postgres triggers `alert-dispatcher` which delivers push notifications to the user's mobile device via Expo.

---

## 6. Configuring Automated pg_cron Jobs

Supabase Free Tier includes the `pg_cron` extension for automated database maintenance.

1. In your **Supabase Cloud Dashboard**, go to **Database** ➔ **Extensions**.
2. Search for `pg_cron` and click **Enable**.
3. Open the **SQL Editor** and execute the following scheduling commands:

```sql
-- 1. Hourly Downsampling & Retention Purge
-- Runs at minute 5 of every hour: rolls up raw readings into min/max/avg and purges raw data older than 7 days
SELECT cron.schedule(
  'rollup-and-purge-readings-hourly',
  '5 * * * *',
  'CALL public.rollup_and_purge_readings();'
);

-- 2. Offline Device Heartbeat Sweeper
-- Runs every 15 minutes: checks if any paired device has not transmitted data in the last 60 minutes
SELECT cron.schedule(
  'check-offline-devices-heartbeat',
  '*/15 * * * *',
  'CALL public.check_offline_devices();'
);
```

4. Verify your scheduled jobs:
   ```sql
   SELECT * FROM cron.job;
   ```

---

## 7. Building Standalone Android APK with Expo EAS (Free Tier)

Expo Application Services (EAS) provides **30 free cloud Android builds every month**, allowing you to create a direct installable `.apk` file for testing on any Android phone without paying for a Google Play Developer account ($25).

### Step 1: Log in to EAS
```bash
cd soil-moisture
eas login
```
*(Create a free account on [expo.dev](https://expo.dev) if you don't have one).*

### Step 2: Initialize EAS Project
```bash
eas project:init
```

### Step 3: Configure Cloud Environment Secrets
Set your production Supabase credentials inside EAS:
```bash
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://<YOUR_PROJECT_ID>.supabase.co" --type string
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<YOUR_ANON_KEY>" --type string
```

### Step 4: Run the Standalone APK Build
```bash
eas build -p android --profile preview
```
* The build executes on Expo's high-speed cloud runners.
* When complete (typically 5–8 minutes), EAS outputs a direct download link and QR code for the `.apk` file.
* Scan the QR code or download the `.apk` to your phone and install it directly!

---

## 8. Deploying Web Dashboard (Vercel / Netlify)

The Smart Flora mobile app is fully universal and runs seamlessly as a progressive web application:

1. In `soil-moisture/`, export the optimized web bundle:
   ```bash
   npx expo export -p web
   ```
2. The production web static assets are placed in `dist/`.
3. Deploy to **Vercel** or **Netlify** (Free Tier):
   ```bash
   # Using Vercel CLI:
   npx vercel deploy --prod dist

   # Or using Netlify CLI:
   npx netlify deploy --prod --dir=dist
   ```
4. Configure the environment variables `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the hosting provider dashboard.

---

## 🎯 Verification Checklist

- [x] Database migrations applied and tables visible in Supabase Table Editor.
- [x] Edge Function `ingest` reachable via HTTPS POST.
- [x] `on_alert_created` webhook active on `public.alerts`.
- [x] `pg_cron` jobs visible in `cron.job`.
- [x] Hardware simulator streams data into `readings`.
- [x] Mobile app connects, registers push token, and displays live sensor dials.
