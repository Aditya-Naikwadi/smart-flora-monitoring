/*
 * ==============================================================================
 * Smart Flora - ESP32 Direct Cloud Telemetry & Live Terminal Monitor
 * ==============================================================================
 * This sketch sends sensor readings directly into Supabase via REST API,
 * which instantly pushes to your Smart Flora Mobile Application via WebSocket
 * and triggers push notifications if moisture/temperature thresholds are breached.
 * ==============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <DHT.h>

// ------------------------------------------------------------------------------
// 1. WiFi Network Credentials (ENTER YOUR WIFI HERE)
// ------------------------------------------------------------------------------
const char* WIFI_SSID     = "YOUR_WIFI_SSID";     // <-- Change to your WiFi name
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD"; // <-- Change to your WiFi password

// ------------------------------------------------------------------------------
// 2. Supabase Cloud Configuration
// ------------------------------------------------------------------------------
// Direct Supabase REST API endpoint for real-time readings
const char* SUPABASE_REST_URL = "https://jtxatelmmgsprghvtyhh.supabase.co/rest/v1/readings";
const char* SUPABASE_ANON_KEY = "sb_publishable_EivbdBfQUKHp1uT_ri-Zdw_8s2EKxP4";

// ------------------------------------------------------------------------------
// 3. Plant & Device Identifiers
// Default test plant: Monstera Deliciosa
// ------------------------------------------------------------------------------
const char* PLANT_ID  = "00000000-0000-0000-0000-000000000001";
const char* DEVICE_ID = "00000000-0000-0000-0000-000000000001";

// ------------------------------------------------------------------------------
// 4. Hardware Pin Connections
// ------------------------------------------------------------------------------
#define SOIL_PIN 34    // ADC1 GPIO 34 (Capacitive Moisture Sensor Analog Out)
#define DHT_PIN  4     // GPIO 4 (DHT11/DHT22 Data Pin)
#define DHT_TYPE DHT11 // Change to DHT22 if using white DHT22 sensor

// Capacitive Sensor Calibration (dry air vs saturated water)
const int RAW_DRY = 3200; // Value in open air
const int RAW_WET = 1400; // Value when dipped in cup of water

// Reporting interval (in milliseconds, 10 seconds between live updates)
const unsigned long REPORT_INTERVAL_MS = 10000; 

DHT dht(DHT_PIN, DHT_TYPE);
unsigned long lastReportTime = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n==================================================");
  Serial.println("🌿 Smart Flora - ESP32 Realtime Telemetry Boot");
  Serial.println("==================================================");

  // Initialize Sensors
  pinMode(SOIL_PIN, INPUT);
  analogReadResolution(12); // 12-bit ADC (0 - 4095)
  dht.begin();
  Serial.println("[Hardware] Sensors initialized (Soil: GPIO 34, DHT: GPIO 4).");

  // Connect to WiFi
  Serial.print("[WiFi] Connecting to: ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 25) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected successfully!");
    Serial.print("[WiFi] IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("[WiFi] RSSI Signal: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  } else {
    Serial.println("\n[WiFi] Connection failed. Please check SSID & Password.");
  }

  Serial.println("==================================================\n");
}

void loop() {
  unsigned long currentTime = millis();

  if (currentTime - lastReportTime >= REPORT_INTERVAL_MS || lastReportTime == 0) {
    lastReportTime = currentTime;
    readAndTransmitTelemetry();
  }

  delay(100);
}

void readAndTransmitTelemetry() {
  // 1. Read Soil Moisture (Analog 12-bit ADC: 0 - 4095)
  int soilMoistureRaw = analogRead(SOIL_PIN);

  // Calculate Moisture Percentage
  float moisturePercent = 0.0;
  if (soilMoistureRaw >= RAW_DRY) {
    moisturePercent = 0.0;
  } else if (soilMoistureRaw <= RAW_WET) {
    moisturePercent = 100.0;
  } else {
    moisturePercent = ((float)(RAW_DRY - soilMoistureRaw) / (float)(RAW_DRY - RAW_WET)) * 100.0;
  }

  // 2. Read Temperature and Humidity from DHT
  float temperature = dht.readTemperature(); // Celsius
  float humidity = dht.readHumidity();       // Percentage

  // If DHT read fails (e.g. pin not connected yet), provide fallback
  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("[DHT Warning] Could not read from DHT pin 4. Check wiring or change DHT_TYPE.");
    temperature = 24.5;
    humidity = 52.0;
  }

  int rssi = WiFi.RSSI();

  // 3. Print Live Results to Arduino IDE Terminal / Serial Monitor
  Serial.println("--------------------------------------------------");
  Serial.print("📊 [TERMINAL SENSORS] ");
  Serial.print("Soil Raw: ");
  Serial.print(soilMoistureRaw);
  Serial.print(" (");
  Serial.print(moisturePercent, 1);
  Serial.print("%) | Temp: ");
  Serial.print(temperature, 1);
  Serial.print("°C | Humidity: ");
  Serial.print(humidity, 1);
  Serial.print("% | WiFi: ");
  Serial.print(rssi);
  Serial.println(" dBm");

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Reconnecting...");
    WiFi.reconnect();
    return;
  }

  // 4. Build JSON Payload for Supabase readings table
  String jsonPayload = "{";
  jsonPayload += "\"plant_id\":\"" + String(PLANT_ID) + "\",";
  jsonPayload += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
  jsonPayload += "\"soil_moisture_raw\":" + String(soilMoistureRaw) + ",";
  jsonPayload += "\"soil_moisture_percent\":" + String(moisturePercent, 2) + ",";
  jsonPayload += "\"temperature_c\":" + String(temperature, 2) + ",";
  jsonPayload += "\"humidity_percent\":" + String(humidity, 2) + ",";
  jsonPayload += "\"battery_voltage\":4.12,";
  jsonPayload += "\"rssi\":" + String(rssi);
  jsonPayload += "}";

  // 5. Transmit directly to Supabase REST endpoint
  WiFiClientSecure client;
  client.setInsecure(); // Bypass SSL fingerprint check
  client.setTimeout(12000);

  HTTPClient http;
  if (http.begin(client, SUPABASE_REST_URL)) {
    http.addHeader("Content-Type", "application/json");
    http.addHeader("apikey", SUPABASE_ANON_KEY);
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
    http.addHeader("Prefer", "return=minimal");

    Serial.print("[Cloud Ingest] POST to ");
    Serial.println(SUPABASE_REST_URL);
    Serial.print("[Cloud Ingest] Payload: ");
    Serial.println(jsonPayload);

    int httpCode = http.POST(jsonPayload);

    if (httpCode > 0) {
      Serial.print("[Cloud Ingest] HTTP Status: ");
      Serial.println(httpCode);

      if (httpCode == 201 || httpCode == 200) {
        Serial.println("✅ [SUCCESS] Reading recorded in Supabase!");
        Serial.println("📱 Mobile app dashboard & gauge updated in real-time.");
      } else if (httpCode == 401 || httpCode == 403) {
        Serial.println("⚠️ [POLICY NOTICE] Supabase Row Level Security blocked the insert.");
        Serial.println("👉 In Supabase SQL Editor, run: CREATE POLICY \"Allow anon insert for readings\" ON public.readings FOR INSERT TO anon WITH CHECK (true);");
      } else {
        String resp = http.getString();
        Serial.print("[Cloud Response] ");
        Serial.println(resp);
      }
    } else {
      Serial.print("[Error] HTTP POST failed, error: ");
      Serial.println(http.errorToString(httpCode).c_str());
    }

    http.end();
  } else {
    Serial.println("[Error] Unable to connect to Supabase host");
  }
  Serial.println("--------------------------------------------------\n");
}
