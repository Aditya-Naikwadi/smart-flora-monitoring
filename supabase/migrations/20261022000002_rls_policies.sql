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
