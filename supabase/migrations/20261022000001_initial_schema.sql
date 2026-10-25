-- ==============================================================================
-- Migration: 20261022000001_initial_schema.sql
-- Description: Core schema for Smart Plant Monitoring System
-- Tables: profiles, plants, devices, readings, hourly_readings, alerts
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Utility function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 1. PROFILES (extends auth.users)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  expo_push_token TEXT,
  notification_enabled BOOLEAN DEFAULT true NOT NULL,
  temperature_unit TEXT DEFAULT 'C' CHECK (temperature_unit IN ('C', 'F')) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Automatically create profile on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 2. PLANTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  species TEXT,
  photo_url TEXT,
  location_note TEXT,
  
  -- Soil moisture bounds (%)
  min_soil_moisture NUMERIC(5,2) DEFAULT 30.00 NOT NULL CHECK (min_soil_moisture >= 0 AND min_soil_moisture <= 100),
  max_soil_moisture NUMERIC(5,2) DEFAULT 80.00 NOT NULL CHECK (max_soil_moisture >= 0 AND max_soil_moisture <= 100),
  
  -- Temperature bounds (°C)
  min_temperature_c NUMERIC(5,2) DEFAULT 15.00 NOT NULL CHECK (min_temperature_c >= -20 AND min_temperature_c <= 60),
  max_temperature_c NUMERIC(5,2) DEFAULT 35.00 NOT NULL CHECK (max_temperature_c >= -20 AND max_temperature_c <= 60),
  
  -- Humidity bounds (%)
  min_humidity_percent NUMERIC(5,2) DEFAULT 40.00 NOT NULL CHECK (min_humidity_percent >= 0 AND min_humidity_percent <= 100),
  max_humidity_percent NUMERIC(5,2) DEFAULT 85.00 NOT NULL CHECK (max_humidity_percent >= 0 AND max_humidity_percent <= 100),
  
  -- Anti-spam alert throttle (minutes between alerts of same type for this plant)
  alert_cooldown_minutes INTEGER DEFAULT 60 NOT NULL CHECK (alert_cooldown_minutes >= 5 AND alert_cooldown_minutes <= 1440),
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  CONSTRAINT check_moisture_bounds CHECK (min_soil_moisture < max_soil_moisture),
  CONSTRAINT check_temperature_bounds CHECK (min_temperature_c < max_temperature_c),
  CONSTRAINT check_humidity_bounds CHECK (min_humidity_percent < max_humidity_percent)
);

CREATE INDEX IF NOT EXISTS idx_plants_owner_id ON public.plants(owner_id);

DROP TRIGGER IF EXISTS set_plants_updated_at ON public.plants;
CREATE TRIGGER set_plants_updated_at
  BEFORE UPDATE ON public.plants
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------------------------
-- 3. DEVICES (ESP32 hardware instances)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plant_id UUID UNIQUE REFERENCES public.plants(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  hashed_secret TEXT NOT NULL, -- SHA-256 hex digest of the 32-byte ingest key
  last_seen TIMESTAMPTZ,
  firmware_version TEXT DEFAULT '1.0.0' NOT NULL,
  
  -- Soil sensor calibration ADC values (12-bit ADC on ESP32 is 0-4095)
  raw_dry_value INTEGER DEFAULT 3200 NOT NULL CHECK (raw_dry_value > 0 AND raw_dry_value <= 4095),
  raw_wet_value INTEGER DEFAULT 1400 NOT NULL CHECK (raw_wet_value > 0 AND raw_wet_value <= 4095),
  
  -- Expected reporting interval for offline heartbeat evaluation
  reporting_interval_seconds INTEGER DEFAULT 300 NOT NULL CHECK (reporting_interval_seconds >= 30 AND reporting_interval_seconds <= 86400),
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  CONSTRAINT check_sensor_calibration CHECK (raw_dry_value > raw_wet_value)
);

CREATE INDEX IF NOT EXISTS idx_devices_owner_id ON public.devices(owner_id);
CREATE INDEX IF NOT EXISTS idx_devices_plant_id ON public.devices(plant_id);

DROP TRIGGER IF EXISTS set_devices_updated_at ON public.devices;
CREATE TRIGGER set_devices_updated_at
  BEFORE UPDATE ON public.devices
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------------------------
-- 4. READINGS (High-frequency sensor telemetry)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  plant_id UUID NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  
  soil_moisture_percent NUMERIC(5,2) NOT NULL CHECK (soil_moisture_percent >= 0 AND soil_moisture_percent <= 100),
  soil_moisture_raw INTEGER NOT NULL CHECK (soil_moisture_raw >= 0 AND soil_moisture_raw <= 4095),
  temperature_c NUMERIC(5,2) NOT NULL CHECK (temperature_c >= -40 AND temperature_c <= 80),
  humidity_percent NUMERIC(5,2) NOT NULL CHECK (humidity_percent >= 0 AND humidity_percent <= 100),
  
  -- Diagnostic metadata
  battery_voltage NUMERIC(4,2) CHECK (battery_voltage IS NULL OR (battery_voltage >= 0 AND battery_voltage <= 10)),
  rssi INTEGER CHECK (rssi IS NULL OR (rssi >= -120 AND rssi <= 0)),
  
  recorded_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Fast time-range lookup indexes for charts (24h, 7d, 30d)
CREATE INDEX IF NOT EXISTS idx_readings_plant_time ON public.readings(plant_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_readings_device_time ON public.readings(device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_readings_recorded_at ON public.readings(recorded_at);

-- ------------------------------------------------------------------------------
-- 5. HOURLY_READINGS (Downsampled historical rollups for long-term trends)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hourly_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id UUID NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  bucket_start TIMESTAMPTZ NOT NULL,
  
  avg_soil_moisture NUMERIC(5,2) NOT NULL,
  min_soil_moisture NUMERIC(5,2) NOT NULL,
  max_soil_moisture NUMERIC(5,2) NOT NULL,
  
  avg_temperature_c NUMERIC(5,2) NOT NULL,
  min_temperature_c NUMERIC(5,2) NOT NULL,
  max_temperature_c NUMERIC(5,2) NOT NULL,
  
  avg_humidity_percent NUMERIC(5,2) NOT NULL,
  min_humidity_percent NUMERIC(5,2) NOT NULL,
  max_humidity_percent NUMERIC(5,2) NOT NULL,
  
  sample_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  CONSTRAINT uq_plant_bucket UNIQUE (plant_id, bucket_start)
);

CREATE INDEX IF NOT EXISTS idx_hourly_readings_plant_bucket ON public.hourly_readings(plant_id, bucket_start DESC);

-- ------------------------------------------------------------------------------
-- 6. ALERTS (Incident tracking and notification logs)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id UUID NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  
  type TEXT NOT NULL CHECK (
    type IN (
      'low_moisture',
      'high_moisture',
      'low_temperature',
      'high_temperature',
      'low_humidity',
      'high_humidity',
      'device_offline',
      'device_online'
    )
  ),
  value NUMERIC(5,2),
  threshold NUMERIC(5,2),
  message TEXT NOT NULL,
  
  acknowledged BOOLEAN DEFAULT false NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alerts_plant_created ON public.alerts(plant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_unack ON public.alerts(plant_id, acknowledged, created_at DESC);
