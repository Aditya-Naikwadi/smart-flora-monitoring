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
  email TEXT,
  full_name TEXT,
  expo_push_token TEXT,
  notification_enabled BOOLEAN DEFAULT true NOT NULL,
  temperature_unit TEXT DEFAULT 'C' CHECK (temperature_unit IN ('C', 'F')) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Ensure email column exists if the table was created in an earlier run
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Automatically create profile on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);
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
  
  -- Temperature bounds (Â°C)
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
-- ==============================================================================
-- Migration: 20261022000002_rls_policies.sql
-- Description: Strict tenant isolation and Row Level Security (RLS) policies
-- Every table has RLS enabled with per-user data isolation.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Enable RLS on all tables
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hourly_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2. PROFILES POLICIES
-- Users can only select and update their own profile.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ------------------------------------------------------------------------------
-- 3. PLANTS POLICIES
-- Users can only view, insert, update, or delete plants they own.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own plants" ON public.plants;
CREATE POLICY "Users can view own plants"
  ON public.plants
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can insert own plants" ON public.plants;
CREATE POLICY "Users can insert own plants"
  ON public.plants
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update own plants" ON public.plants;
CREATE POLICY "Users can update own plants"
  ON public.plants
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete own plants" ON public.plants;
CREATE POLICY "Users can delete own plants"
  ON public.plants
  FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

-- ------------------------------------------------------------------------------
-- 4. DEVICES POLICIES
-- Users can only manage devices they own.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own devices" ON public.devices;
CREATE POLICY "Users can view own devices"
  ON public.devices
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can insert own devices" ON public.devices;
CREATE POLICY "Users can insert own devices"
  ON public.devices
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update own devices" ON public.devices;
CREATE POLICY "Users can update own devices"
  ON public.devices
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete own devices" ON public.devices;
CREATE POLICY "Users can delete own devices"
  ON public.devices
  FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

-- ------------------------------------------------------------------------------
-- 5. READINGS POLICIES
-- Users can view readings belonging to plants they own.
-- Service role has full access; authenticated owners can insert for simulation.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view readings of own plants" ON public.readings;
CREATE POLICY "Users can view readings of own plants"
  ON public.readings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.plants
      WHERE plants.id = readings.plant_id
        AND plants.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert readings for own plants" ON public.readings;
CREATE POLICY "Users can insert readings for own plants"
  ON public.readings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.plants
      WHERE plants.id = readings.plant_id
        AND plants.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete readings of own plants" ON public.readings;
CREATE POLICY "Users can delete readings of own plants"
  ON public.readings
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.plants
      WHERE plants.id = readings.plant_id
        AND plants.owner_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------------------
-- 6. HOURLY_READINGS POLICIES
-- Users can view historical rollups belonging to plants they own.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view hourly rollups of own plants" ON public.hourly_readings;
CREATE POLICY "Users can view hourly rollups of own plants"
  ON public.hourly_readings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.plants
      WHERE plants.id = hourly_readings.plant_id
        AND plants.owner_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------------------
-- 7. ALERTS POLICIES
-- Users can view and acknowledge alerts belonging to plants they own.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view alerts of own plants" ON public.alerts;
CREATE POLICY "Users can view alerts of own plants"
  ON public.alerts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.plants
      WHERE plants.id = alerts.plant_id
        AND plants.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update (acknowledge) alerts of own plants" ON public.alerts;
CREATE POLICY "Users can update (acknowledge) alerts of own plants"
  ON public.alerts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.plants
      WHERE plants.id = alerts.plant_id
        AND plants.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.plants
      WHERE plants.id = alerts.plant_id
        AND plants.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete alerts of own plants" ON public.alerts;
CREATE POLICY "Users can delete alerts of own plants"
  ON public.alerts
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.plants
      WHERE plants.id = alerts.plant_id
        AND plants.owner_id = auth.uid()
    )
  );

-- ------------------------------------------------------------------------------
-- 8. SECURE DEVICE PROVISIONING RPC
-- Generates a 32-byte cryptographically secure hexadecimal token in database,
-- stores SHA-256(secret) in devices table, and returns the plaintext secret ONCE.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pair_device(
  p_plant_id UUID,
  p_name TEXT,
  p_raw_dry INTEGER DEFAULT 3200,
  p_raw_wet INTEGER DEFAULT 1400,
  p_interval INTEGER DEFAULT 300
)
RETURNS TABLE (
  device_id UUID,
  device_name TEXT,
  plant_id UUID,
  plain_secret TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_secret TEXT;
  v_hashed_secret TEXT;
  v_device_id UUID;
  v_created_at TIMESTAMPTZ;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Ensure the user owns the plant (if linked)
  IF p_plant_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.plants WHERE id = p_plant_id AND owner_id = v_user_id) THEN
      RAISE EXCEPTION 'Plant not found or not owned by user';
    END IF;
  END IF;

  -- Generate 32 bytes of secure random hex (64 chars)
  v_secret := encode(gen_random_bytes(32), 'hex');
  -- Compute SHA-256 hash
  v_hashed_secret := encode(digest(v_secret, 'sha256'), 'hex');

  -- Insert device
  INSERT INTO public.devices (
    owner_id,
    plant_id,
    name,
    hashed_secret,
    raw_dry_value,
    raw_wet_value,
    reporting_interval_seconds
  ) VALUES (
    v_user_id,
    p_plant_id,
    p_name,
    v_hashed_secret,
    p_raw_dry,
    p_raw_wet,
    p_interval
  )
  RETURNING id, created_at INTO v_device_id, v_created_at;

  RETURN QUERY
  SELECT
    v_device_id,
    p_name,
    p_plant_id,
    v_secret AS plain_secret,
    v_created_at;
END;
$$;
-- ==============================================================================
-- Migration: 20261022000003_retention_and_rollups.sql
-- Description: Data retention & downsampling strategy
-- Keeps database footprint safely under 50 MB (far below the 500 MB free tier limit).
-- Raw readings are kept for 30 days; older data is rolled up into hourly averages.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ROLLUP & PURGE STORED PROCEDURE
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rollup_and_purge_readings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Step 1: Downsample raw readings older than 24 hours into 1-hour buckets in hourly_readings
  INSERT INTO public.hourly_readings (
    plant_id,
    device_id,
    bucket_start,
    avg_soil_moisture,
    min_soil_moisture,
    max_soil_moisture,
    avg_temperature_c,
    min_temperature_c,
    max_temperature_c,
    avg_humidity_percent,
    min_humidity_percent,
    max_humidity_percent,
    sample_count
  )
  SELECT
    r.plant_id,
    r.device_id,
    date_trunc('hour', r.recorded_at) AS bucket_start,
    ROUND(AVG(r.soil_moisture_percent), 2) AS avg_soil_moisture,
    MIN(r.soil_moisture_percent) AS min_soil_moisture,
    MAX(r.soil_moisture_percent) AS max_soil_moisture,
    ROUND(AVG(r.temperature_c), 2) AS avg_temperature_c,
    MIN(r.temperature_c) AS min_temperature_c,
    MAX(r.temperature_c) AS max_temperature_c,
    ROUND(AVG(r.humidity_percent), 2) AS avg_humidity_percent,
    MIN(r.humidity_percent) AS min_humidity_percent,
    MAX(r.humidity_percent) AS max_humidity_percent,
    COUNT(*)::INTEGER AS sample_count
  FROM public.readings r
  WHERE r.recorded_at < NOW() - INTERVAL '24 hours'
    AND r.recorded_at >= NOW() - INTERVAL '31 days'
  GROUP BY r.plant_id, r.device_id, date_trunc('hour', r.recorded_at)
  ON CONFLICT (plant_id, bucket_start) DO UPDATE
  SET
    avg_soil_moisture = EXCLUDED.avg_soil_moisture,
    min_soil_moisture = EXCLUDED.min_soil_moisture,
    max_soil_moisture = EXCLUDED.max_soil_moisture,
    avg_temperature_c = EXCLUDED.avg_temperature_c,
    min_temperature_c = EXCLUDED.min_temperature_c,
    max_temperature_c = EXCLUDED.max_temperature_c,
    avg_humidity_percent = EXCLUDED.avg_humidity_percent,
    min_humidity_percent = EXCLUDED.min_humidity_percent,
    max_humidity_percent = EXCLUDED.max_humidity_percent,
    sample_count = EXCLUDED.sample_count;

  -- Step 2: Delete raw readings older than 30 days
  DELETE FROM public.readings
  WHERE recorded_at < NOW() - INTERVAL '30 days';

  -- Step 3: Purge acknowledged alerts older than 90 days
  DELETE FROM public.alerts
  WHERE acknowledged = true
    AND created_at < NOW() - INTERVAL '90 days';
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. ENABLE SUPABASE REALTIME REPLICATION
-- Realtime pushes new sensor rows and alert items directly to mobile subscribers.
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  -- Add readings and alerts to the supabase_realtime publication if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'readings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.readings;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'devices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.devices;
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. SCHEDULE MAINTENANCE VIA PG_CRON (if available on Supabase)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Run rollup & purge daily at 02:00 AM UTC
    PERFORM cron.schedule(
      'soil-moisture-rollup-and-purge',
      '0 2 * * *',
      'SELECT public.rollup_and_purge_readings();'
    );
  END IF;
END $$;
-- ==============================================================================
-- Migration: 20261022000004_alert_triggers.sql
-- Description: In-database threshold evaluation with hysteresis & cooldown
-- Automatically logs alerts to public.alerts when readings breach plant thresholds.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TRIGGER FUNCTION: Evaluate reading thresholds on new reading insert
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_reading_alerts()
RETURNS TRIGGER AS $$
DECLARE
  v_plant RECORD;
  v_device RECORD;
  v_last_alert_time TIMESTAMPTZ;
  v_cooldown_interval INTERVAL;
BEGIN
  -- Fetch plant configuration and thresholds
  SELECT * INTO v_plant
  FROM public.plants
  WHERE id = NEW.plant_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_cooldown_interval := (v_plant.alert_cooldown_minutes || ' minutes')::INTERVAL;

  -- ---------------------------------------------------------------------------
  -- Device recovery check: if device was offline and now sending data, log online
  -- ---------------------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM public.alerts
    WHERE plant_id = NEW.plant_id
      AND type = 'device_offline'
      AND acknowledged = false
      AND created_at >= NOW() - INTERVAL '24 hours'
  ) THEN
    -- Mark previous offline alert as acknowledged/resolved
    UPDATE public.alerts
    SET acknowledged = true, acknowledged_at = NOW()
    WHERE plant_id = NEW.plant_id
      AND type = 'device_offline'
      AND acknowledged = false;

    -- Insert back-online notification
    INSERT INTO public.alerts (
      plant_id,
      device_id,
      type,
      message
    ) VALUES (
      NEW.plant_id,
      NEW.device_id,
      'device_online',
      v_plant.name || ' sensor device is back online and transmitting telemetry.'
    );
  END IF;

  -- ---------------------------------------------------------------------------
  -- 1. Check Low Soil Moisture (Critically Dry)
  -- ---------------------------------------------------------------------------
  IF NEW.soil_moisture_percent < v_plant.min_soil_moisture THEN
    SELECT created_at INTO v_last_alert_time
    FROM public.alerts
    WHERE plant_id = NEW.plant_id
      AND type = 'low_moisture'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_last_alert_time IS NULL OR (NOW() - v_last_alert_time) > v_cooldown_interval THEN
      INSERT INTO public.alerts (plant_id, device_id, type, value, threshold, message)
      VALUES (
        NEW.plant_id,
        NEW.device_id,
        'low_moisture',
        NEW.soil_moisture_percent,
        v_plant.min_soil_moisture,
        v_plant.name || ' soil moisture is critically dry (' || NEW.soil_moisture_percent || '%). Needs watering!'
      );
    END IF;

  -- ---------------------------------------------------------------------------
  -- 2. Check High Soil Moisture (Overwatered)
  -- ---------------------------------------------------------------------------
  ELSIF NEW.soil_moisture_percent > v_plant.max_soil_moisture THEN
    SELECT created_at INTO v_last_alert_time
    FROM public.alerts
    WHERE plant_id = NEW.plant_id
      AND type = 'high_moisture'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_last_alert_time IS NULL OR (NOW() - v_last_alert_time) > v_cooldown_interval THEN
      INSERT INTO public.alerts (plant_id, device_id, type, value, threshold, message)
      VALUES (
        NEW.plant_id,
        NEW.device_id,
        'high_moisture',
        NEW.soil_moisture_percent,
        v_plant.max_soil_moisture,
        v_plant.name || ' soil moisture is high (' || NEW.soil_moisture_percent || '%). Beware of root rot.'
      );
    END IF;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 3. Check Temperature Extremes
  -- ---------------------------------------------------------------------------
  IF NEW.temperature_c > v_plant.max_temperature_c THEN
    SELECT created_at INTO v_last_alert_time
    FROM public.alerts
    WHERE plant_id = NEW.plant_id
      AND type = 'high_temperature'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_last_alert_time IS NULL OR (NOW() - v_last_alert_time) > v_cooldown_interval THEN
      INSERT INTO public.alerts (plant_id, device_id, type, value, threshold, message)
      VALUES (
        NEW.plant_id,
        NEW.device_id,
        'high_temperature',
        NEW.temperature_c,
        v_plant.max_temperature_c,
        v_plant.name || ' ambient temperature is too hot (' || NEW.temperature_c || 'Â°C).'
      );
    END IF;
  ELSIF NEW.temperature_c < v_plant.min_temperature_c THEN
    SELECT created_at INTO v_last_alert_time
    FROM public.alerts
    WHERE plant_id = NEW.plant_id
      AND type = 'low_temperature'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_last_alert_time IS NULL OR (NOW() - v_last_alert_time) > v_cooldown_interval THEN
      INSERT INTO public.alerts (plant_id, device_id, type, value, threshold, message)
      VALUES (
        NEW.plant_id,
        NEW.device_id,
        'low_temperature',
        NEW.temperature_c,
        v_plant.min_temperature_c,
        v_plant.name || ' ambient temperature is too cold (' || NEW.temperature_c || 'Â°C).'
      );
    END IF;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 4. Check Humidity Extremes
  -- ---------------------------------------------------------------------------
  IF NEW.humidity_percent < v_plant.min_humidity_percent THEN
    SELECT created_at INTO v_last_alert_time
    FROM public.alerts
    WHERE plant_id = NEW.plant_id
      AND type = 'low_humidity'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_last_alert_time IS NULL OR (NOW() - v_last_alert_time) > v_cooldown_interval THEN
      INSERT INTO public.alerts (plant_id, device_id, type, value, threshold, message)
      VALUES (
        NEW.plant_id,
        NEW.device_id,
        'low_humidity',
        NEW.humidity_percent,
        v_plant.min_humidity_percent,
        v_plant.name || ' air humidity is low (' || NEW.humidity_percent || '%).'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_evaluate_reading_alerts ON public.readings;
CREATE TRIGGER trigger_evaluate_reading_alerts
  AFTER INSERT ON public.readings
  FOR EACH ROW
  EXECUTE FUNCTION public.evaluate_reading_alerts();

-- ------------------------------------------------------------------------------
-- 2. OFFLINE DEVICE DETECTOR FUNCTION
-- Scans for devices that have missed 3 consecutive reporting intervals
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_offline_devices()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rec RECORD;
  v_count INTEGER := 0;
  v_last_alert_time TIMESTAMPTZ;
BEGIN
  FOR v_rec IN
    SELECT
      d.id AS device_id,
      d.name AS device_name,
      d.plant_id,
      d.reporting_interval_seconds,
      d.last_seen,
      p.name AS plant_name,
      p.alert_cooldown_minutes
    FROM public.devices d
    JOIN public.plants p ON p.id = d.plant_id
    WHERE d.plant_id IS NOT NULL
      AND (
        d.last_seen IS NULL
        OR d.last_seen < (NOW() - (d.reporting_interval_seconds * 3 * INTERVAL '1 second'))
      )
  LOOP
    -- Check if an unacknowledged offline alert was already fired recently
    SELECT created_at INTO v_last_alert_time
    FROM public.alerts
    WHERE plant_id = v_rec.plant_id
      AND type = 'device_offline'
      AND acknowledged = false
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_last_alert_time IS NULL OR (NOW() - v_last_alert_time) > ((v_rec.alert_cooldown_minutes || ' minutes')::INTERVAL) THEN
      INSERT INTO public.alerts (
        plant_id,
        device_id,
        type,
        message
      ) VALUES (
        v_rec.plant_id,
        v_rec.device_id,
        'device_offline',
        'Device "' || v_rec.device_name || '" for ' || v_rec.plant_name || ' is offline (no signal for 3+ reporting intervals).'
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;
-- ==============================================================================
-- Seed Data: supabase/seed.sql
-- Description: Realistic initial data for local development & demonstration
-- Includes: Demo user, 2 plants, 2 devices, 24h realistic time series, alerts
-- ==============================================================================

DO $$
DECLARE
  v_user_id UUID := '00000000-0000-0000-0000-000000000001';
  v_monstera_id UUID := '11111111-1111-1111-1111-111111111111';
  v_snakeplant_id UUID := '22222222-2222-2222-2222-222222222222';
  v_device_monstera_id UUID := '33333333-3333-3333-3333-333333333333';
  v_device_snake_id UUID := '44444444-4444-4444-4444-444444444444';
  
  v_time TIMESTAMPTZ;
  v_step_minutes INTEGER := 30;
  v_steps_count INTEGER := 48; -- 24 hours at 30-min steps
  i INTEGER;
  
  -- Telemetry variables
  v_soil_pct NUMERIC(5,2);
  v_soil_raw INTEGER;
  v_temp NUMERIC(5,2);
  v_hum NUMERIC(5,2);
BEGIN
  -- ---------------------------------------------------------------------------
  -- 1. Create or ensure Demo User in auth.users
  -- ---------------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) THEN
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'demo@smartplant.io',
      crypt('password123', gen_salt('bf')),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Botanist Demo"}',
      NOW(),
      NOW()
    );
  END IF;

  -- Ensure profile exists
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    notification_enabled,
    temperature_unit
  ) VALUES (
    v_user_id,
    'demo@smartplant.io',
    'Botanist Demo',
    true,
    'C'
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = EXCLUDED.full_name;

  -- ---------------------------------------------------------------------------
  -- 2. Insert Plants
  -- ---------------------------------------------------------------------------
  INSERT INTO public.plants (
    id,
    owner_id,
    name,
    species,
    photo_url,
    location_note,
    min_soil_moisture,
    max_soil_moisture,
    min_temperature_c,
    max_temperature_c,
    min_humidity_percent,
    max_humidity_percent,
    alert_cooldown_minutes
  ) VALUES
  (
    v_monstera_id,
    v_user_id,
    'Monstera Deliciosa',
    'Monstera deliciosa',
    'https://images.unsplash.com/photo-1614594975525-e45190c55d0b?w=600',
    'Living Room by East-facing window',
    35.00,
    80.00,
    18.00,
    30.00,
    45.00,
    85.00,
    60
  ),
  (
    v_snakeplant_id,
    v_user_id,
    'Snake Plant (Sansevieria)',
    'Dracaena trifasciata',
    'https://images.unsplash.com/photo-1599598425947-52028666ec48?w=600',
    'Office Desk shelf',
    15.00,
    60.00,
    15.00,
    35.00,
    30.00,
    70.00,
    120
  )
  ON CONFLICT (id) DO NOTHING;

  -- ---------------------------------------------------------------------------
  -- 3. Insert Devices
  -- Note: The plaintext test secrets for simulation are:
  -- Monstera device:  test_secret_monstera_1234567890abcdef
  -- Snakeplant device: test_secret_snakeplant_1234567890abcdef
  -- ---------------------------------------------------------------------------
  INSERT INTO public.devices (
    id,
    owner_id,
    plant_id,
    name,
    hashed_secret,
    last_seen,
    firmware_version,
    raw_dry_value,
    raw_wet_value,
    reporting_interval_seconds
  ) VALUES
  (
    v_device_monstera_id,
    v_user_id,
    v_monstera_id,
    'ESP32-LivingRoom-01',
    encode(digest('test_secret_monstera_1234567890abcdef', 'sha256'), 'hex'),
    NOW(),
    '1.2.0',
    3200,
    1400,
    300
  ),
  (
    v_device_snake_id,
    v_user_id,
    v_snakeplant_id,
    'ESP32-OfficeDesk-02',
    encode(digest('test_secret_snakeplant_1234567890abcdef', 'sha256'), 'hex'),
    NOW() - INTERVAL '15 minutes',
    '1.2.0',
    3350,
    1450,
    600
  )
  ON CONFLICT (id) DO NOTHING;

  -- ---------------------------------------------------------------------------
  -- 4. Generate 24-Hour Historical Readings
  -- Simulates realistic environmental fluctuation (diurnal temp/hum cycle, soil drying)
  -- ---------------------------------------------------------------------------
  -- Clear existing readings for repeatable seeding
  DELETE FROM public.readings WHERE plant_id IN (v_monstera_id, v_snakeplant_id);

  FOR i IN 0..v_steps_count LOOP
    v_time := NOW() - ((v_steps_count - i) * (v_step_minutes || ' minutes')::INTERVAL);

    -- Monstera: Starting at 58% moisture, gradually drying down to 42%
    -- Temp: 22Â°C base + 4Â°C sine wave midday
    -- Humidity: 60% base - 10% midday
    v_soil_pct := ROUND((58.0 - (i::numeric / v_steps_count::numeric * 16.0) + (sin(i::numeric / 3.0) * 0.8))::numeric, 2);
    -- Raw ADC mapping: raw = dry - ((pct / 100) * (dry - wet))
    v_soil_raw := ROUND(3200 - ((v_soil_pct / 100.0) * (3200 - 1400)))::INTEGER;
    v_temp := ROUND((22.5 + (sin((i::numeric / v_steps_count::numeric * 2 * 3.14159) - 1.5) * 4.2))::numeric, 2);
    v_hum := ROUND((58.0 - (sin((i::numeric / v_steps_count::numeric * 2 * 3.14159) - 1.5) * 12.0))::numeric, 2);

    INSERT INTO public.readings (
      device_id,
      plant_id,
      soil_moisture_percent,
      soil_moisture_raw,
      temperature_c,
      humidity_percent,
      battery_voltage,
      rssi,
      recorded_at
    ) VALUES (
      v_device_monstera_id,
      v_monstera_id,
      v_soil_pct,
      v_soil_raw,
      v_temp,
      v_hum,
      4.12,
      -58,
      v_time
    );

    -- Snake Plant: Very slow dry-out (drought tolerant), starting 28% drying to 24%
    v_soil_pct := ROUND((28.0 - (i::numeric / v_steps_count::numeric * 4.0))::numeric, 2);
    v_soil_raw := ROUND(3350 - ((v_soil_pct / 100.0) * (3350 - 1450)))::INTEGER;
    v_temp := ROUND((23.0 + (sin((i::numeric / v_steps_count::numeric * 2 * 3.14159) - 1.5) * 3.8))::numeric, 2);
    v_hum := ROUND((50.0 - (sin((i::numeric / v_steps_count::numeric * 2 * 3.14159) - 1.5) * 10.0))::numeric, 2);

    INSERT INTO public.readings (
      device_id,
      plant_id,
      soil_moisture_percent,
      soil_moisture_raw,
      temperature_c,
      humidity_percent,
      battery_voltage,
      rssi,
      recorded_at
    ) VALUES (
      v_device_snake_id,
      v_snakeplant_id,
      v_soil_pct,
      v_soil_raw,
      v_temp,
      v_hum,
      4.05,
      -64,
      v_time
    );
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- 5. Insert Sample Alerts
  -- ---------------------------------------------------------------------------
  DELETE FROM public.alerts WHERE plant_id IN (v_monstera_id, v_snakeplant_id);

  INSERT INTO public.alerts (
    plant_id,
    device_id,
    type,
    value,
    threshold,
    message,
    acknowledged,
    acknowledged_at,
    created_at
  ) VALUES
  (
    v_monstera_id,
    v_device_monstera_id,
    'low_moisture',
    34.2,
    35.0,
    'Monstera Deliciosa soil moisture is critically dry (34.2%). Needs watering!',
    false,
    NULL,
    NOW() - INTERVAL '45 minutes'
  ),
  (
    v_snakeplant_id,
    v_device_snake_id,
    'device_online',
    NULL,
    NULL,
    'Snake Plant sensor device is back online and transmitting telemetry.',
    true,
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '3 hours'
  );

END $$;
