#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <DHT.h>

// ==============================================================================
// 1. Wi-Fi Configuration
// ==============================================================================
// Enter your 2.4 GHz Wi-Fi credentials below (ESP32 does NOT support 5 GHz Wi-Fi)
const char* WIFI_SSID     = "YOUR_WIFI_SSID";     // <-- Enter your 2.4 GHz Wi-Fi SSID
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD"; // <-- Enter your Wi-Fi Password

// ==============================================================================
// 2. Supabase Cloud Configuration
// ==============================================================================
// Target Supabase REST API endpoint for real-time readings table
const char* SUPABASE_REST_URL = "https://jtxatelmmgsprghvtyhh.supabase.co/rest/v1/readings";

// Public anon publishable key (safe to include in client firmware)
const char* SUPABASE_ANON_KEY = "sb_publishable_EivbdBfQUKHp1uT_ri-Zdw_8s2EKxP4";

// ==============================================================================
// 3. Plant & Device Identifiers
// IMPORTANT:
// If you are logged in to the mobile app with your own account, replace these with
// the UUID of the plant and device you created in your app.
// If you are testing with the default seed account, use demo@smartplant.io / password123.
// ==============================================================================
const char* PLANT_ID  = "00000000-0000-0000-0000-000000000001";
const char* DEVICE_ID = "00000000-0000-0000-0000-000000000001";

// ==============================================================================
// 4. Hardware Pin Mapping & Sensor Setup
// ==============================================================================
#define SOIL_PIN 34    // ADC1 GPIO 34 (Analog input from capacitive moisture sensor)
#define DHT_PIN  4     // GPIO 4 (Digital data line from DHT11 / DHT22)
#define DHT_TYPE DHT11 // Change to DHT22 if using a white DHT22 (AM2302) sensor

// ==============================================================================
// 5. Calibration Constants
// Calibrate these by reading the raw ADC output from the Serial Monitor:
//   - RAW_DRY: Sensor held in open air (completely dry). Typical: 3200 to 4095
//   - RAW_WET: Sensor submerged in a glass of water up to the white line. Typical: 1300 to 1800
// ==============================================================================
const int RAW_DRY = 4000; // Sensor reading in dry air
const int RAW_WET = 1400; // Sensor reading submerged in water

// Telemetry transmit interval (10,000 ms = 10 seconds)
const unsigned long REPORT_INTERVAL_MS = 10000;

// Initialize DHT library
DHT dht(DHT_PIN, DHT_TYPE);

unsigned long lastReportTime = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n==================================================");
  Serial.println("🌿 Smart Flora - ESP32 Telemetry Monitor");
  Serial.println("==================================================");

  // 1. Configure Soil Moisture ADC Pin
  pinMode(SOIL_PIN, INPUT);
  analogReadResolution(12);             // 12-bit ADC resolution (0 to 4095)
  analogSetPinAttenuation(SOIL_PIN, ADC_11db); // Full-scale voltage ~3.3V

  // 2. Initialize DHT Sensor
  dht.begin();
  Serial.println("[Hardware] Sensors initialized on GPIO 34 (Soil) and GPIO 4 (DHT11).");

  // 3. Connect to Wi-Fi
  connectToWiFi();

  Serial.println("==================================================\n");
}

void loop() {
  unsigned long currentTime = millis();

  // Transmit telemetry periodically
  if (currentTime - lastReportTime >= REPORT_INTERVAL_MS || lastReportTime == 0) {
    lastReportTime = currentTime;
    readAndTransmitTelemetry();
  }

  delay(100);
}

/**
 * Manages Wi-Fi connection and re-establishes connection if disconnected
 */
void connectToWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

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
    Serial.print("[WiFi] Assigned IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("[WiFi] Signal Strength (RSSI): ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");

    // Configure fallback to Google Public DNS to avoid router/hotspot DNS drops
    IPAddress primaryDNS(8, 8, 8, 8);
    IPAddress secondaryDNS(8, 8, 4, 4);
    WiFi.config(WiFi.localIP(), WiFi.gatewayIP(), WiFi.subnetMask(), primaryDNS, secondaryDNS);
  } else {
    Serial.println("\n[WiFi Error] Failed to connect. Check Wi-Fi SSID, password, and ensure 2.4 GHz network.");
  }
}

/**
 * Reads sensor hardware, computes moisture %, validates readings, and uploads to Supabase
 */
void readAndTransmitTelemetry() {
  // Ensure Wi-Fi connection is healthy
  if (WiFi.status() != WL_CONNECTED) {
    connectToWiFi();
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[Error] No Wi-Fi connection. Skipping telemetry upload.");
      return;
    }
  }

  // ----------------------------------------------------------------------------
  // 1. Read Soil Moisture Sensor (Average 5 samples to reduce electrical noise)
  // ----------------------------------------------------------------------------
  long adcSum = 0;
  for (int i = 0; i < 5; i++) {
    adcSum += analogRead(SOIL_PIN);
    delay(10);
  }
  int soilMoistureRaw = adcSum / 5;

  // Calculate Soil Moisture Percentage:
  // Capacitive sensors output higher voltage/ADC when dry and lower voltage when wet
  float moisturePercent = 0.0;
  if (soilMoistureRaw >= RAW_DRY) {
    moisturePercent = 0.0;
  } else if (soilMoistureRaw <= RAW_WET) {
    moisturePercent = 100.0;
  } else {
    moisturePercent = ((float)(RAW_DRY - soilMoistureRaw) / (float)(RAW_DRY - RAW_WET)) * 100.0;
  }
  // Clamp to valid 0.0% - 100.0% range
  moisturePercent = constrain(moisturePercent, 0.0f, 100.0f);

  // ----------------------------------------------------------------------------
  // 2. Read DHT11 Temperature and Humidity with Retry
  // ----------------------------------------------------------------------------
  float temperature = dht.readTemperature();
  float humidity    = dht.readHumidity();

  // Retry once after 250 ms if first attempt fails (DHT timing sensitivity)
  if (isnan(temperature) || isnan(humidity)) {
    delay(250);
    temperature = dht.readTemperature();
    humidity    = dht.readHumidity();
  }

  int rssi = WiFi.RSSI();

  // Print raw diagnostic data to Serial Monitor
  Serial.println("--------------------------------------------------");
  Serial.print("📊 [SENSORS] Soil Raw: ");
  Serial.print(soilMoistureRaw);
  Serial.print(" (");
  Serial.print(moisturePercent, 1);
  Serial.print("%)");

  if (isnan(temperature) || isnan(humidity)) {
    Serial.println(" | [DHT Error] Temperature/Humidity: NOT DETECTED (nan)");
    Serial.println("⚠️  [Wiring Check] Verify DHT11 VCC is 3.3V/5V, GND is common, and DATA is on GPIO 4 with a 4.7k-10k pull-up resistor.");
    Serial.println("⛔ [Upload Skipped] Supabase schema requires valid temperature and humidity. Skipping upload until sensor responds.");
    Serial.println("--------------------------------------------------\n");
    return; // Never upload fake numbers!
  } else {
    Serial.print(" | Temp: ");
    Serial.print(temperature, 1);
    Serial.print(" °C | Humidity: ");
    Serial.print(humidity, 1);
    Serial.print(" % | RSSI: ");
    Serial.print(rssi);
    Serial.println(" dBm");
  }

  // ----------------------------------------------------------------------------
  // 3. Construct JSON Payload (Alinged with Supabase readings schema)
  // ----------------------------------------------------------------------------
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

  // ----------------------------------------------------------------------------
  // 4. Transmit Payload via HTTPS to Supabase REST API
  // ----------------------------------------------------------------------------
  WiFiClientSecure client;
  client.setInsecure();       // Bypass TLS certificate authority bundle verification
  client.setTimeout(12000);   // 12 second network timeout

  HTTPClient http;
  if (!http.begin(client, SUPABASE_REST_URL)) {
    Serial.println("[Error] Failed to initialize HTTPS connection to Supabase endpoint.");
    Serial.println("--------------------------------------------------\n");
    return;
  }

  // Set required Supabase REST headers
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  http.addHeader("Prefer", "return=minimal"); // Returns 201 Created on success without large payload

  Serial.println("[HTTPS Cloud] Transmitting telemetry payload to Supabase...");
  int httpResponseCode = http.POST(jsonPayload);

  // ----------------------------------------------------------------------------
  // 5. Evaluate Server Response
  // ----------------------------------------------------------------------------
  if (httpResponseCode > 0) {
    Serial.print("[HTTPS Cloud] HTTP Response Code: ");
    Serial.println(httpResponseCode);

    if (httpResponseCode == 201 || httpResponseCode == 200) {
      Serial.println("✅ [SUCCESS] Telemetry recorded in Supabase!");
      Serial.println("📱 Live readings updated in mobile app dashboard.");
    } else if (httpResponseCode == 401 || httpResponseCode == 403) {
      Serial.println("❌ [HTTP 401/403: RLS Policy Error] Supabase Row Level Security rejected the insert.");
      Serial.println("👉 Run this in Supabase Dashboard SQL Editor:");
      Serial.println("   CREATE POLICY \"Allow anon insert for readings\" ON public.readings FOR INSERT TO anon WITH CHECK (true);");
    } else if (httpResponseCode == 400) {
      Serial.println("❌ [HTTP 400: Bad Request] Invalid JSON or invalid Plant/Device UUID format.");
      Serial.println(http.getString());
    } else if (httpResponseCode == 404) {
      Serial.println("❌ [HTTP 404: Not Found] The URL endpoint does not exist. Check SUPABASE_REST_URL.");
    } else {
      Serial.print("⚠️ [HTTP Status ");
      Serial.print(httpResponseCode);
      Serial.print("] Server message: ");
      Serial.println(http.getString());
    }
  } else {
    Serial.print("❌ [Network Error] HTTPS POST failed. Error code: ");
    Serial.print(httpResponseCode);
    Serial.print(" (");
    Serial.print(http.errorToString(httpResponseCode).c_str());
    Serial.println(")");
    Serial.println("💡 Suggestions: Check Wi-Fi router internet access, DNS resolution, and ESP32 heap memory.");
  }

  http.end();
  Serial.println("--------------------------------------------------\n");
}
