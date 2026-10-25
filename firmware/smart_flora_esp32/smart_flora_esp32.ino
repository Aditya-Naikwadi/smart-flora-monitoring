/*
 * ==============================================================================
 * Smart Flora - ESP32 IoT Soil & Environmental Telemetry Sketch
 * ==============================================================================
 * Features:
 *  - Reads Capacitive Soil Moisture Sensor (Analog ADC on GPIO 34)
 *  - Reads DHT11 / DHT22 Temperature & Humidity Sensor (Digital on GPIO 4)
 *  - Logs real-time sensor values directly to the Arduino IDE Serial Terminal
 *  - Transmits authenticated telemetry JSON via HTTPS to Supabase Ingest Endpoint
 *  - Live updates appear instantly on your Smart Flora Mobile Application via Realtime WebSocket
 *  - Automatically triggers Mobile & Web Push Notifications when thresholds are breached
 * ==============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <DHT.h>

// ------------------------------------------------------------------------------
// 1. WiFi Network Credentials
// ------------------------------------------------------------------------------
const char* WIFI_SSID     = "YOUR_WIFI_SSID";         // Replace with your WiFi name
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";     // Replace with your WiFi password

// ------------------------------------------------------------------------------
// 2. Supabase Backend Ingest Endpoint
// ------------------------------------------------------------------------------
const char* INGEST_URL = "https://jtxatelmmgsprghvtyhh.supabase.co/functions/v1/ingest";

// ------------------------------------------------------------------------------
// 3. Device Authentication Credentials
// (Retrieve these from your Mobile App by opening the Plant -> Device Ingest Key)
// ------------------------------------------------------------------------------
const char* DEVICE_ID     = "00000000-0000-0000-0000-000000000001"; // Your Device UUID
const char* DEVICE_SECRET = "test_secret_monstera_1234567890abcdef"; // Your 32-char Ingest Key

// ------------------------------------------------------------------------------
// 4. Hardware Pin Connections
// ------------------------------------------------------------------------------
#define SOIL_PIN 34    // ADC1 GPIO 34 (Capacitive Moisture Sensor Analog Out)
#define DHT_PIN  4     // GPIO 4 (DHT11/DHT22 Data Pin)
#define DHT_TYPE DHT11 // Change to DHT22 if using white DHT22 sensor

// Reporting interval (in milliseconds, minimum 15000 ms = 15 seconds)
const unsigned long REPORT_INTERVAL_MS = 20000; 

DHT dht(DHT_PIN, DHT_TYPE);
unsigned long lastReportTime = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n==================================================");
  Serial.println("🌿 Smart Flora - ESP32 Sensor Telemetry Boot");
  Serial.println("==================================================");

  // Initialize Sensors
  pinMode(SOIL_PIN, INPUT);
  dht.begin();
  Serial.println("[Hardware] DHT and Analog ADC sensors initialized.");

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
    Serial.print("[WiFi] Signal Strength (RSSI): ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  } else {
    Serial.println("\n[WiFi] Connection failed. Please check SSID & Password.");
  }

  Serial.println("==================================================\n");
}

void loop() {
  unsigned long currentTime = millis();

  // Send telemetry report every REPORT_INTERVAL_MS
  if (currentTime - lastReportTime >= REPORT_INTERVAL_MS || lastReportTime == 0) {
    lastReportTime = currentTime;
    readAndTransmitTelemetry();
  }

  // Small delay to keep the task responsive
  delay(100);
}

void readAndTransmitTelemetry() {
  // 1. Read Soil Moisture (Analog 12-bit ADC: 0 - 4095)
  // Higher value = drier soil on capacitive sensor; lower value = wetter soil
  int soilMoistureRaw = analogRead(SOIL_PIN);

  // 2. Read Temperature and Humidity from DHT
  float temperature = dht.readTemperature(); // Celsius
  float humidity = dht.readHumidity();       // Percentage

  // Fallbacks if sensor read fails
  if (isnan(temperature)) {
    Serial.println("[Warning] Failed to read from DHT sensor! Using fallback.");
    temperature = 24.5;
  }
  if (isnan(humidity)) {
    humidity = 50.0;
  }

  int rssi = WiFi.RSSI();

  // 3. Print Live Results to Arduino IDE Terminal / Serial Monitor
  Serial.println("--------------------------------------------------");
  Serial.print("📊 [TERMINAL LIVE SENSORS] ");
  Serial.print("Soil Raw ADC: ");
  Serial.print(soilMoistureRaw);
  Serial.print(" | Temp: ");
  Serial.print(temperature, 1);
  Serial.print(" °C | Humidity: ");
  Serial.print(humidity, 1);
  Serial.print(" % | WiFi RSSI: ");
  Serial.print(rssi);
  Serial.println(" dBm");

  // 4. Check WiFi Connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Reconnecting to network...");
    WiFi.reconnect();
    return;
  }

  // 5. Build JSON Payload
  // Format matches TelemetryPayloadSchema expected by Supabase Edge Function
  String jsonPayload = "{";
  jsonPayload += "\"soil_moisture_raw\":" + String(soilMoistureRaw) + ",";
  jsonPayload += "\"temperature_c\":" + String(temperature, 2) + ",";
  jsonPayload += "\"humidity_percent\":" + String(humidity, 2) + ",";
  jsonPayload += "\"battery_voltage\":4.12,";
  jsonPayload += "\"rssi\":" + String(rssi);
  jsonPayload += "}";

  // 6. Transmit over HTTPS
  WiFiClientSecure client;
  client.setInsecure(); // Allows HTTPS without loading root CA bundle on microcontroller

  HTTPClient http;
  if (http.begin(client, INGEST_URL)) {
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-device-id", DEVICE_ID);
    http.addHeader("x-device-secret", DEVICE_SECRET);

    Serial.print("[Cloud Ingest] POST to ");
    Serial.println(INGEST_URL);
    Serial.print("[Cloud Ingest] Payload: ");
    Serial.println(jsonPayload);

    int httpCode = http.POST(jsonPayload);

    if (httpCode > 0) {
      Serial.print("[Cloud Ingest] Response HTTP Status: ");
      Serial.println(httpCode);
      String response = http.getString();
      Serial.print("[Cloud Ingest] Server Response: ");
      Serial.println(response);

      if (httpCode == 200) {
        Serial.println("✅ [SUCCESS] Sensor reading ingested!");
        Serial.println("📱 Mobile app dashboard updated in real-time.");
      } else if (httpCode == 429) {
        Serial.println("⏳ [RATE LIMIT] Reported too quickly. Wait 15s between reports.");
      } else {
        Serial.println("⚠️ [NOTICE] Check Device ID and Secret credentials.");
      }
    } else {
      Serial.print("[Error] HTTP POST failed, error: ");
      Serial.println(http.errorToString(httpCode).c_str());
    }

    http.end();
  } else {
    Serial.println("[Error] Unable to connect to Supabase HTTP server");
  }
  Serial.println("--------------------------------------------------\n");
}
