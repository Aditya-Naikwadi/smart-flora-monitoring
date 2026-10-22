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
        v_plant.name || ' ambient temperature is too hot (' || NEW.temperature_c || '°C).'
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
        v_plant.name || ' ambient temperature is too cold (' || NEW.temperature_c || '°C).'
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
