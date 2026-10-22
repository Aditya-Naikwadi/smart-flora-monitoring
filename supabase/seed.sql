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
    full_name,
    notification_enabled,
    temperature_unit
  ) VALUES (
    v_user_id,
    'Botanist Demo',
    true,
    'C'
  )
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name;

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
    -- Temp: 22°C base + 4°C sine wave midday
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
