# 🌿 Smart Flora: IoE Smart Plant Monitoring System

An end-to-end, production-grade Internet of Everything (IoE) plant monitoring platform built with **ESP32 hardware telemetry**, a **Supabase (PostgreSQL, RLS, Edge Functions)** cloud backend, and a modern cross-platform **React Native (Expo SDK 58, TypeScript Strict)** mobile application.

Designed specifically to run **100% on free tiers** (Supabase Free Plan + Expo EAS Free), with zero credit card requirements, high-res 7-day telemetry retention with automated hourly downsampling, and cryptographically secure hardware ingestion.

---

## 📐 System Architecture

```
                                  ┌────────────────────────────────────────────────────────┐
                                  │                  ESP32 Microcontroller                 │
                                  │  • Capacitive Soil Sensor v1.2 (ADC Pin 34)           │
                                  │  • DHT11 / DHT22 Temp & Humidity (GPIO 4)             │
                                  │  • Deep Sleep Cycle (15 min) & SHA-256 HMAC Secret     │
                                  └───────────────────────────┬────────────────────────────┘
                                                              │ HTTPS POST /functions/v1/ingest
                                                              │ (JSON payload + x-device-secret)
                                                              ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           SUPABASE CLOUD                                                 │
│                                                                                                          │
│   ┌──────────────────────────────┐        ┌─────────────────────────┐     ┌──────────────────────────┐   │
│   │   Ingest Edge Function       │───────▶│  PostgreSQL Database    │◀────│ Alert Dispatcher Edge Fn │   │
│   │   • Constant-time SHA-256    │        │  • profiles, plants     │     │ • Listens on alerts table │   │
│   │   • Zod Payload Validation   │        │  • devices (paired)     │     │ • Dispatches via Expo API │   │
│   │   • 15-second Rate Limiter   │        │  • readings (raw 7-day) │     └────────────┬─────────────┘   │
│   └──────────────────────────────┘        │  • hourly_readings      │                  │                 │
│                                           │  • Row Level Security   │                  │                 │
│   ┌──────────────────────────────┐        └────────────┬────────────┘                  │                 │
│   │  pg_cron Automated Sweeper   │                     │                               │                 │
│   │  • Hourly rollup downsample  │                     │ Realtime WebSocket            │ Push Webhook    │
│   │  • 1-hour offline detector   │                     │ (postgres_changes)            │                 │
│   └──────────────────────────────┘                     │                               │                 │
└────────────────────────────────────────────────────────┼───────────────────────────────┼─────────────────┘
                                                         │                               │
                                                         ▼                               ▼
                                  ┌────────────────────────────────────────────────────────┐
                                  │                 Smart Flora Mobile App                 │
                                  │  • Expo SDK 58 / Expo Router / React Native 0.88       │
                                  │  • TanStack React Query v5 & Zustand Client Cache      │
                                  │  • Gifted Charts (24h raw / 7d / 30d hourly averages)  │
                                  │  • Botanical Dark & Light Theme Modes                  │
                                  │  • Offline Banner & Crash Error Boundaries             │
                                  └────────────────────────────────────────────────────────┘
```

---

## 🌟 Key Features

1. **Precision Telemetry & Calibration**:
   * Reads raw analog ADC from Capacitive Soil Moisture Sensor v1.2.
   * Eliminates corrosion associated with resistive sensors.
   * Maps 3200 (air/dry) to 1400 (water/saturated) ADC to 0–100% volumetric moisture.
   * Dual DHT11/DHT22 atmospheric temperature and relative humidity tracking.
2. **Hardened Cloud Backend (Supabase Free Plan)**:
   * **Multi-tenant RLS isolation**: Users can strictly query their own plants, devices, and alerts.
   * **Constant-Time SHA-256 Auth**: Prevents timing attacks on hardware ingestion secrets.
   * **Sub-500MB Data Strategy**: Automated pg_cron rollups aggregate raw readings into min/max/avg hourly metrics, purging raw data after 7 days to preserve free-tier storage indefinitely.
   * **Autonomous Alert Triggers**: Database triggers monitor thresholds (low moisture, heat spikes, overwatering) with a 30-minute cooldown mechanism to prevent notification storms.
   * **Device Offline Sweeper**: Flags devices as offline if no ping is received for over 60 minutes.
3. **Cross-Platform Mobile App (Expo SDK 58)**:
   * **Realtime Dashboard**: Live gauge dials, SVG moisture meters, and instant status badges (`Healthy`, `Warning`, `Danger`).
   * **Interactive Telemetry Charts**: Powered by `react-native-gifted-charts`, switching seamlessly between 24-Hour (raw), 7-Day (hourly), and 30-Day (historical) timelines.
   * **Live Threshold Calibration**: In-app modal lets users customize individual moisture and temperature thresholds per plant.
   * **Incident Notification Center**: Filter incidents by plant, mark individual alerts acknowledged, or batch-dismiss with real-time app badge synchronization.
   * **Offline Banner & Error Boundaries**: Graceful fallback caching when connectivity drops and full component error recovery.

---

## 📁 Repository Structure

```
.
├── docs/
│   ├── device-ingest-contract.md    # Hardware pinout, payload format & ESP32 C++ firmware
│   ├── deployment-and-build-guide.md # Free-tier cloud deploy & Android APK build guide
│   └── college-project-report.md    # Comprehensive academic report for university evaluation
├── simulator/                       # Node.js ESP32 hardware simulator test harness
│   ├── package.json
│   ├── tsconfig.json
│   └── simulate-device.ts           # Emulates physical ESP32 sending sinusoidal telemetry
├── soil-moisture/                   # Cross-platform Expo mobile app
│   ├── package.json
│   ├── app.json
│   ├── tsconfig.json
│   ├── tests/                       # 14 automated unit tests (sensorMath, Zod validation)
│   ├── src/
│   │   ├── app/                     # Expo Router file-based screens
│   │   ├── components/              # Reusable UI, cards, gauges, charts & modals
│   │   ├── constants/               # Botanical theme palettes, spacing, typography
│   │   ├── features/                # Auth, plants, telemetry, alerts & push hooks
│   │   ├── hooks/                   # useAppTheme, useNetworkStatus
│   │   ├── lib/                     # Supabase client & TanStack Query client
│   │   ├── store/                   # Zustand auth & settings stores
│   │   ├── types/                   # Supabase database TypeScript definitions
│   │   └── utils/                   # Pure sensor calibration & conversion math
└── supabase/
    ├── config.toml                  # Supabase CLI configuration
    ├── seed.sql                     # Demo data (user, plants, devices, 24h telemetry)
    ├── functions/
    │   ├── ingest/                  # Hardware telemetry ingest Edge Function
    │   └── alert-dispatcher/        # Push notification webhook Edge Function
    └── migrations/
        ├── 20261022000001_initial_schema.sql        # Database tables & indexes
        ├── 20261022000002_rls_policies.sql          # Row Level Security & pairing RPC
        ├── 20261022000003_retention_and_rollups.sql # Hourly downsampling & retention
        └── 20261022000004_alert_triggers.sql        # In-database threshold & offline engine
```

---

## 🚀 Quickstart Guide

### Prerequisites
* [Node.js](https://nodejs.org/) v18+ (v22 recommended)
* [Git](https://git-scm.com/)
* [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm install -g supabase`)
* [Expo Go](https://expo.dev/client) app installed on your physical iOS/Android phone

---

### Step 1: Start Supabase Backend Locally

1. Open a terminal in the root directory:
   ```bash
   # Start local Supabase containers (Docker required for local, or connect to Supabase Cloud)
   supabase start
   ```
2. Apply migrations and seed data:
   ```bash
   supabase db reset
   ```
3. Serve Edge Functions:
   ```bash
   supabase functions serve --no-verify-jwt
   ```
   * *Local Ingest Endpoint*: `http://127.0.0.1:54321/functions/v1/ingest`
   * Note the `anon_key` and `service_role_key` displayed in the terminal output.

---

### Step 2: Start Mobile App (`soil-moisture`)

1. Navigate to the mobile app directory:
   ```bash
   cd soil-moisture
   ```
2. Verify environment configuration (`.env`):
   ```env
   EXPO_PUBLIC_SUPABASE_URL=http://<YOUR_LOCAL_IP_OR_SUPABASE_CLOUD_URL>:54321
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJh...
   ```
3. Install dependencies and run test suite:
   ```bash
   npm test
   ```
4. Start the Expo development server:
   ```bash
   npx expo start
   ```
5. Scan the QR code with **Expo Go** on Android (or Camera app on iOS).
6. Log in with the pre-seeded demo user:
   * **Email**: `demo@smartflora.io`
   * **Password**: `FloraPass123!`

---

### Step 3: Run the ESP32 Hardware Simulator

To simulate live telemetry without physical ESP32 hardware:

1. Open a new terminal in the `simulator` directory:
   ```bash
   cd simulator
   ```
2. Run automated test cycle (checks pairing, valid telemetry, rate limiting, and invalid secret rejection):
   ```bash
   npm test
   ```
3. Start continuous telemetry streaming (emulating an active plant sensor):
   ```bash
   npm run start:continuous
   ```
   * Watch your mobile app dashboard update in real time via Supabase WebSockets!

---

## 🔒 Security Architecture

1. **Zero Secret Storage in Plaintext**:
   * Hardware ingestion secrets are stored in Postgres strictly as **SHA-256 hashes** (`devices.secret_hash`).
   * When pairing a device, the user receives an ephemeral 32-character ingest key generated cryptographically in the pairing modal.
2. **Timing-Attack Resistance**:
   * The `ingest` Edge Function uses `crypto.subtle.timingSafeEqual` to verify the hardware ingest secret in constant time.
3. **Hardware Ingestion Rate Limiting**:
   * Enforces a 15-second per-device rate limit to protect cloud bandwidth from malfunctioning or loop-locked microcontrollers.
4. **Row Level Security (RLS)**:
   * All tables (`profiles`, `plants`, `devices`, `readings`, `hourly_readings`, `alerts`) enforce strict RLS policies bound to `auth.uid() = user_id`.

---

## 📊 Free Tier Verification

| Component | Free Tier Allowance | Smart Flora Consumption | Status |
| :--- | :--- | :--- | :--- |
| **Supabase Database** | 500 MB Postgres storage | ~12 MB (after 7-day downsampling purge) | ✅ < 3% used |
| **Supabase Edge Functions** | 500,000 invocations / month | ~86,400 (two devices pinging every 15 min) | ✅ < 18% used |
| **Expo EAS Build** | 30 free Android builds / month | 1–2 builds needed for production APK | ✅ < 10% used |
| **Expo Push API** | Unlimited free push notifications | Incident-driven (< 200 / month) | ✅ 100% Free |
| **Netlify / Vercel** | 100 GB bandwidth / month | Optional web dashboard (< 500 MB) | ✅ 100% Free |

---

## 📚 Documentation Links

* [Hardware Spec & Firmware Contract](file:///docs/device-ingest-contract.md)
* [Cloud Deployment & EAS Build Guide](file:///docs/deployment-and-build-guide.md)
* [Academic Project Report](file:///docs/college-project-report.md)

---

## 📄 License
This project is open-source under the **MIT License**.
