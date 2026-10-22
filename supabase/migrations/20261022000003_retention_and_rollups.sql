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
