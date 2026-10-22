# ESP32 Device Ingestion Contract

**Protocol Version**: 1.0.0  
**Target Architecture**: ESP32 / ESP32-S3 / ESP32-C3 with Capacitive Soil Moisture Sensor v1.2 + DHT11/DHT22  
**Transport**: HTTPS POST (TLS 1.2 or TLS 1.3)  
**Encoding**: `application/json` (UTF-8)

---

## 1. Endpoint & Network Specification

| Parameter | Specification |
| :--- | :--- |
| **URL Path** | `https://<YOUR_SUPABASE_PROJECT_REF>.functions.supabase.co/ingest` |
| **HTTP Method** | `POST` |
| **Port** | `443` |
| **Certificate** | Standard root CA (Let's Encrypt / DigiCert ISRG Root X1) or Insecure TLS skip (if flash memory constrained) |
| **Minimum Reporting Interval** | 300 seconds (5 minutes) recommended; 15 seconds absolute minimum (rate-limited) |

---

## 2. Request Headers

Every telemetry transmission **must** include the following headers:

| Header Name | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `Content-Type` | String | Fixed MIME type | `application/json` |
| `x-device-id` | UUIDv4 | Device UUID obtained upon pairing | `33333333-3333-3333-3333-333333333333` |
| `x-device-secret` | String | 32-byte hex secret flashed to the ESP32 | `test_secret_monstera_1234567890abcdef` |

> [!CAUTION]
> If `x-device-id` or `x-device-secret` is omitted, malformed, or does not match the SHA-256 hash stored in the cloud, the server responds with **`HTTP 401 Unauthorized`** and the reading is dropped.

---

## 3. JSON Payload Fields & Physical Limits

```json
{
  "soil_moisture_raw": 2150,
  "temperature_c": 24.5,
  "humidity_percent": 55.0,
  "battery_voltage": 4.12,
  "rssi": -62
}
```

### Field Definitions

| Field Name | Type | Required? | Valid Range | Physical Sensor Unit / Notes |
| :--- | :--- | :--- | :--- | :--- |
| `soil_moisture_raw` | Integer | **Yes** | `0` to `4095` | Raw 12-bit ADC value from capacitive analog output pin (e.g. GPIO34). Higher values denote dry air; lower values denote saturated water. |
| `temperature_c` | Float | **Yes** | `-40.0` to `80.0` | Ambient temperature in Celsius read from DHT11 / DHT22. |
| `humidity_percent` | Float | **Yes** | `0.0` to `100.0` | Ambient relative humidity percentage. |
| `battery_voltage` | Float | Optional | `0.0` to `10.0` | Measured battery or supply rail voltage (e.g. 3.7V - 4.2V for Li-ion 18650). |
| `rssi` | Integer | Optional | `-120` to `0` | WiFi signal strength in dBm reported by `WiFi.RSSI()`. |

---

## 4. Response Codes & Error Handling

### `201 Created` — Successful Ingestion
```json
{
  "success": true,
  "reading_id": "7f8b86d4-8d96-419b-a3d8-55a73e6b5412",
  "plant_id": "11111111-1111-1111-1111-111111111111",
  "computed_moisture_percent": 58.33,
  "recorded_at": "2026-10-22T13:45:00.000Z"
}
```

### `400 Bad Request` — Validation Failure or Out-of-Bounds Sensor
Returned if values violate physical bounds or JSON is malformed.
```json
{
  "error": "Validation failed for telemetry fields",
  "details": [
    { "field": "humidity_percent", "message": "Relative humidity cannot exceed 100%" }
  ]
}
```

### `401 Unauthorized` — Invalid Secret / Missing Headers
```json
{
  "error": "Unauthorized: Invalid device secret"
}
```

### `404 Not Found` — Device ID Does Not Exist
```json
{
  "error": "Device not found"
}
```

### `429 Too Many Requests` — Transmitting Too Quickly (<15s)
```json
{
  "error": "Rate limit exceeded: Telemetry is being reported too frequently.",
  "min_interval_seconds": 15,
  "retry_after_seconds": 12
}
```

---

## 5. ESP32 Retry & Power Strategy

1. **Sleep / Wake Cycle**:
   - The ESP32 wakes from Deep Sleep every **5 minutes** (300 seconds).
   - Reads sensors 3 consecutive times, averages out transient analog ADC spikes.
2. **Exponential Backoff**:
   - If WiFi connection fails or server returns `5xx` / network timeout:
     - Retry 1: wait 5 seconds.
     - Retry 2: wait 15 seconds.
     - Retry 3: wait 45 seconds.
     - If all retries fail, enter deep sleep for the normal 5-minute interval to preserve battery.
3. **Handling 429**:
   - Read the `Retry-After` header and delay transmission accordingly.

---

## 6. Complete Firmware Code Snippet (ESP32 C++ Arduino)

```cpp
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <DHT.h>

// WiFi Configuration
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

// Supabase Edge Function Ingestion URL
const char* INGEST_URL = "https://<PROJECT-REF>.functions.supabase.co/ingest";

// Device Credentials (obtain from App pairing screen)
const char* DEVICE_ID = "33333333-3333-3333-3333-333333333333";
const char* DEVICE_SECRET = "test_secret_monstera_1234567890abcdef";

// Sensor Pin Definitions
#define SOIL_ADC_PIN 34 // Analog GPIO pin for Capacitive Soil Moisture Sensor v1.2
#define DHT_PIN 4       // Digital GPIO pin for DHT sensor
#define DHT_TYPE DHT22  // or DHT11

DHT dht(DHT_PIN, DHT_TYPE);

void setup() {
  Serial.begin(115200);
  delay(1000);

  dht.begin();
  analogReadResolution(12); // 12-bit ADC (0 - 4095)

  // Connect to WiFi
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected! IP: " + WiFi.localIP().toString());

  // Transmit telemetry
  sendTelemetry();

  // Enter Deep Sleep for 5 minutes (300 seconds) to conserve battery
  Serial.println("Entering deep sleep for 300 seconds...");
  esp_sleep_enable_timer_wakeup(300ULL * 1000000ULL);
  esp_deep_sleep_start();
}

void loop() {
  // Not used in deep sleep architecture
}

void sendTelemetry() {
  // 1. Read Soil Moisture Sensor (average 5 samples)
  int rawSum = 0;
  for (int i = 0; i < 5; i++) {
    rawSum += analogRead(SOIL_ADC_PIN);
    delay(20);
  }
  int soilRaw = rawSum / 5;

  // 2. Read DHT sensor
  float tempC = dht.readTemperature();
  float humidity = dht.readHumidity();

  // Check for sensor read failure
  if (isnan(tempC) || isnan(humidity)) {
    Serial.println("Warning: Failed to read from DHT sensor!");
    tempC = 25.0; // Fallback default
    humidity = 50.0;
  }

  // 3. Assemble JSON Payload
  int rssi = WiFi.RSSI();
  String payload = "{";
  payload += "\"soil_moisture_raw\":" + String(soilRaw) + ",";
  payload += "\"temperature_c\":" + String(tempC, 2) + ",";
  payload += "\"humidity_percent\":" + String(humidity, 2) + ",";
  payload += "\"rssi\":" + String(rssi);
  payload += "}";

  Serial.println("Posting Payload: " + payload);

  // 4. Send HTTPS POST Request
  WiFiClientSecure client;
  client.setInsecure(); // For production, load ISRG Root X1 certificate

  HTTPClient http;
  if (http.begin(client, INGEST_URL)) {
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-device-id", DEVICE_ID);
    http.addHeader("x-device-secret", DEVICE_SECRET);

    int httpCode = http.POST(payload);
    if (httpCode > 0) {
      String response = http.getString();
      Serial.printf("HTTP Response Code: %d\n", httpCode);
      Serial.println("Server Response: " + response);
    } else {
      Serial.printf("HTTP POST failed! Error: %s\n", http.errorToString(httpCode).c_str());
    }
    http.end();
  }
}
```
