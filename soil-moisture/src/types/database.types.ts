/**
 * Supabase Database Type Definitions
 * Auto-aligned with PostgreSQL migrations:
 * - 20261022000001_initial_schema.sql
 * - 20261022000002_rls_policies.sql
 * - 20261022000003_retention_and_rollups.sql
 * - 20261022000004_alert_triggers.sql
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AlertType =
  | 'low_moisture'
  | 'high_moisture'
  | 'low_temperature'
  | 'high_temperature'
  | 'low_humidity'
  | 'high_humidity'
  | 'device_offline'
  | 'device_online';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          expo_push_token: string | null;
          notification_enabled: boolean;
          temperature_unit: 'C' | 'F';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          expo_push_token?: string | null;
          notification_enabled?: boolean;
          temperature_unit?: 'C' | 'F';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          full_name?: string | null;
          expo_push_token?: string | null;
          notification_enabled?: boolean;
          temperature_unit?: 'C' | 'F';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_id_fkey';
            columns: ['id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      plants: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          species: string | null;
          photo_url: string | null;
          location_note: string | null;
          min_soil_moisture: number;
          max_soil_moisture: number;
          min_temperature_c: number;
          max_temperature_c: number;
          min_humidity_percent: number;
          max_humidity_percent: number;
          alert_cooldown_minutes: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          species?: string | null;
          photo_url?: string | null;
          location_note?: string | null;
          min_soil_moisture?: number;
          max_soil_moisture?: number;
          min_temperature_c?: number;
          max_temperature_c?: number;
          min_humidity_percent?: number;
          max_humidity_percent?: number;
          alert_cooldown_minutes?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          species?: string | null;
          photo_url?: string | null;
          location_note?: string | null;
          min_soil_moisture?: number;
          max_soil_moisture?: number;
          min_temperature_c?: number;
          max_temperature_c?: number;
          min_humidity_percent?: number;
          max_humidity_percent?: number;
          alert_cooldown_minutes?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'plants_owner_id_fkey';
            columns: ['owner_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      devices: {
        Row: {
          id: string;
          owner_id: string;
          plant_id: string | null;
          name: string;
          hashed_secret: string;
          last_seen: string | null;
          firmware_version: string;
          raw_dry_value: number;
          raw_wet_value: number;
          reporting_interval_seconds: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          plant_id?: string | null;
          name: string;
          hashed_secret: string;
          last_seen?: string | null;
          firmware_version?: string;
          raw_dry_value?: number;
          raw_wet_value?: number;
          reporting_interval_seconds?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          plant_id?: string | null;
          name?: string;
          hashed_secret?: string;
          last_seen?: string | null;
          firmware_version?: string;
          raw_dry_value?: number;
          raw_wet_value?: number;
          reporting_interval_seconds?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'devices_owner_id_fkey';
            columns: ['owner_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'devices_plant_id_fkey';
            columns: ['plant_id'];
            referencedRelation: 'plants';
            referencedColumns: ['id'];
          }
        ];
      };
      readings: {
        Row: {
          id: string;
          device_id: string;
          plant_id: string;
          soil_moisture_percent: number;
          soil_moisture_raw: number;
          temperature_c: number;
          humidity_percent: number;
          battery_voltage: number | null;
          rssi: number | null;
          recorded_at: string;
        };
        Insert: {
          id?: string;
          device_id: string;
          plant_id: string;
          soil_moisture_percent: number;
          soil_moisture_raw: number;
          temperature_c: number;
          humidity_percent: number;
          battery_voltage?: number | null;
          rssi?: number | null;
          recorded_at?: string;
        };
        Update: {
          id?: string;
          device_id?: string;
          plant_id?: string;
          soil_moisture_percent?: number;
          soil_moisture_raw?: number;
          temperature_c?: number;
          humidity_percent?: number;
          battery_voltage?: number | null;
          rssi?: number | null;
          recorded_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'readings_device_id_fkey';
            columns: ['device_id'];
            referencedRelation: 'devices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'readings_plant_id_fkey';
            columns: ['plant_id'];
            referencedRelation: 'plants';
            referencedColumns: ['id'];
          }
        ];
      };
      hourly_readings: {
        Row: {
          id: string;
          plant_id: string;
          device_id: string;
          bucket_start: string;
          avg_soil_moisture: number;
          min_soil_moisture: number;
          max_soil_moisture: number;
          avg_temperature_c: number;
          min_temperature_c: number;
          max_temperature_c: number;
          avg_humidity_percent: number;
          min_humidity_percent: number;
          max_humidity_percent: number;
          sample_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          plant_id: string;
          device_id: string;
          bucket_start: string;
          avg_soil_moisture: number;
          min_soil_moisture: number;
          max_soil_moisture: number;
          avg_temperature_c: number;
          min_temperature_c: number;
          max_temperature_c: number;
          avg_humidity_percent: number;
          min_humidity_percent: number;
          max_humidity_percent: number;
          sample_count: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          plant_id?: string;
          device_id?: string;
          bucket_start?: string;
          avg_soil_moisture?: number;
          min_soil_moisture?: number;
          max_soil_moisture?: number;
          avg_temperature_c?: number;
          min_temperature_c?: number;
          max_temperature_c?: number;
          avg_humidity_percent?: number;
          min_humidity_percent?: number;
          max_humidity_percent?: number;
          sample_count?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'hourly_readings_device_id_fkey';
            columns: ['device_id'];
            referencedRelation: 'devices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'hourly_readings_plant_id_fkey';
            columns: ['plant_id'];
            referencedRelation: 'plants';
            referencedColumns: ['id'];
          }
        ];
      };
      alerts: {
        Row: {
          id: string;
          plant_id: string;
          device_id: string | null;
          type: AlertType;
          value: number | null;
          threshold: number | null;
          message: string;
          acknowledged: boolean;
          acknowledged_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          plant_id: string;
          device_id?: string | null;
          type: AlertType;
          value?: number | null;
          threshold?: number | null;
          message: string;
          acknowledged?: boolean;
          acknowledged_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          plant_id?: string;
          device_id?: string | null;
          type?: AlertType;
          value?: number | null;
          threshold?: number | null;
          message?: string;
          acknowledged?: boolean;
          acknowledged_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'alerts_device_id_fkey';
            columns: ['device_id'];
            referencedRelation: 'devices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'alerts_plant_id_fkey';
            columns: ['plant_id'];
            referencedRelation: 'plants';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      pair_device: {
        Args: {
          p_plant_id: string | null;
          p_name: string;
          p_raw_dry?: number;
          p_raw_wet?: number;
          p_interval?: number;
        };
        Returns: {
          device_id: string;
          device_name: string;
          plant_id: string | null;
          plain_secret: string;
          created_at: string;
        }[];
      };
      check_offline_devices: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      rollup_and_purge_readings: {
        Args: Record<PropertyKey, never>;
        Returns: void;
      };
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
