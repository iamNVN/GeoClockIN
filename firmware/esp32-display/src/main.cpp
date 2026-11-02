// GeoClockIN office display: an ESP32 and a 2.8" ILI9341 screen (optional DS3231
// clock) that shows a new signed QR code every second, without ever contacting
// GeoClockIN. See README.md for the parts, wiring and how to test it.
//
// The display creates its own ECDSA P-256 key on first boot. It shows a setup code
// holding the public key, which an admin scans in Settings > Office QR. After that,
// every code is:
//
//   {"v":2,"d":"<id>","n":"<nonce>","iat":<created>,"exp":<expires>,"p":"att","sig":"<signature>"}
//
// signed over `GCQ2|<d>|<n>|<iat>|<exp>|<p>`. backend/src/lib/qrToken.js checks it.
//
// Wi-Fi is only used to set the clock (NTP), for a few seconds each hour. On the
// simulator (SIMULATOR defined) it uses the simulated network and stays connected.

// On wokwi.com, uncomment this line: there are no build flags there.
// #define SIMULATOR

#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <Arduino.h>
#include <Preferences.h>
#include <SPI.h>
#include <WiFi.h>
#include <Wire.h>
#include <bootloader_random.h>
#include <esp_random.h>
#include <esp_sntp.h>
#include <esp_idf_version.h>
#include <mbedtls/bignum.h>
#include <mbedtls/ecdsa.h>
#include <mbedtls/ecp.h>
#include <mbedtls/md.h>
#include <qrcode.h>
#include <sys/time.h>
#include <time.h>

#ifndef SIMULATOR
#include <WiFiManager.h>
#endif

// Wiring.
static const int PIN_TFT_CS = 15;
static const int PIN_TFT_DC = 2;
static const int PIN_TFT_RST = 4;
static const int PIN_TFT_LED = 32;
static const int PIN_RTC_SDA = 21;
static const int PIN_RTC_SCL = 22;
static const int PIN_BUTTON = 0;  // The BOOT button on the board.
// Reliable over jumper wires; a frame still takes under 30 ms.
static const uint32_t TFT_SPI_HZ = 26000000;

// Only for the clock shown on screen. Codes always use UTC seconds.
static const char *CLOCK_TZ = "IST-5:30";
static const char *NTP_PRIMARY = "pool.ntp.org";
static const char *NTP_SECONDARY = "time.google.com";

// Codes.
#ifdef SIMULATOR
// Wokwi limits its simulated CPU to about 8 MHz, so a code takes seconds to make
// there, against a fraction of a second on the chip. Leaving it time between codes
// keeps the simulation running in real time, which the codes' timestamps depend on.
static const uint32_t CODE_INTERVAL_SECONDS = 8;
#else
static const uint32_t CODE_INTERVAL_SECONDS = 1;
#endif
static const uint32_t CODE_LIFETIME_SECONDS = 5;
static const size_t NONCE_BYTES = 9;
static const size_t SIGNATURE_BYTES = 64;
// A code is 180 bytes: exactly what a version 9 QR holds at medium error correction.
static const int CODE_QR_SCALE = 4;
// A setup code is 244 bytes (version 10 at low error correction), and is only
// scanned once, up close.
static const int SETUP_QR_SCALE = 3;
static const int QR_MAX_VERSION = 10;
static const int QR_TOP = 14;
static const int SCREEN_WIDTH = 240;

// Clock.
#ifdef SIMULATOR
// A simulation can run slower than real time, so its clock needs setting often.
static const uint32_t SYNC_INTERVAL_MS = 15UL * 1000;
#else
static const uint32_t SYNC_INTERVAL_MS = 60UL * 60 * 1000;
#endif
static const uint32_t SYNC_RETRY_MS = 5UL * 60 * 1000;
static const uint32_t SYNC_FIRST_RETRY_MS = 30UL * 1000;
static const uint32_t SYNC_TIMEOUT_MS = 40UL * 1000;
static const time_t EARLIEST_VALID_TIME = 1767225600;  // 2026-01-01: anything before is an unset clock.
static const uint8_t RTC_ADDRESS = 0x68;

// BOOT button: a press switches between the setup code and live codes.
static const uint32_t BUTTON_BOUNCE_MS = 30;
static const uint32_t HOLD_FEEDBACK_MS = 3000;
static const uint32_t HOLD_WIFI_MS = 5000;
static const uint32_t HOLD_ERASE_MS = 15000;

// The fixed start of a P-256 public key in SPKI form; the 65-byte point follows.
static const uint8_t SPKI_PREFIX[26] = {0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
                                        0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00};

// Declared before any function: the Arduino build adds function prototypes there.
enum class Sync { Idle, Connecting, WaitingForTime };
enum class Mode { Setup, Live };
enum class Hold { None, Cancel, Wifi, Erase };

static Adafruit_ILI9341 tft(PIN_TFT_CS, PIN_TFT_DC, PIN_TFT_RST);
static Preferences store;

/* ---------------------------------------------------------------- Helpers */

static const mbedtls_md_info_t *sha256Info() { return mbedtls_md_info_from_type(MBEDTLS_MD_SHA256); }

/** Writes `length` bytes as base64url without padding, and a terminating zero. */
static void base64url(const uint8_t *data, size_t length, char *out) {
  static const char ALPHABET[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  size_t o = 0;
  for (size_t i = 0; i < length; i += 3) {
    const size_t left = length - i;
    const uint32_t block = (uint32_t)data[i] << 16 | (left > 1 ? (uint32_t)data[i + 1] << 8 : 0) | (left > 2 ? data[i + 2] : 0);
    out[o++] = ALPHABET[block >> 18 & 63];
    out[o++] = ALPHABET[block >> 12 & 63];
    if (left > 1) out[o++] = ALPHABET[block >> 6 & 63];
    if (left > 2) out[o++] = ALPHABET[block & 63];
  }
  out[o] = 0;
}

/* ----------------------------------------------------------------- Random */

// The chip's generator is only truly random while its radio or this entropy source
// is on, and the radio is off most of the time here. So a 256-bit seed is taken at
// boot, and everything random comes from it through HMAC-SHA256.
static uint8_t randomSeedBytes[32];
static uint64_t randomCounter = 0;

static void seedRandom() {
  bootloader_random_enable();
  esp_fill_random(randomSeedBytes, sizeof randomSeedBytes);
  bootloader_random_disable();
}

static void randomBytes(uint8_t *out, size_t length) {
  while (length > 0) {
    uint8_t block[32];
    randomCounter++;
    mbedtls_md_hmac(sha256Info(), randomSeedBytes, sizeof randomSeedBytes, (const uint8_t *)&randomCounter, sizeof randomCounter, block);
    const size_t take = length < sizeof block ? length : sizeof block;
    memcpy(out, block, take);
    out += take;
    length -= take;
  }
}

static int mbedtlsRandom(void *, unsigned char *out, size_t length) {
  randomBytes(out, length);
  return 0;
}

/* -------------------------------------------------------------------- Key */

static mbedtls_ecp_group curve;
static mbedtls_mpi privateKey;
static char publicKeyText[123];  // 91 bytes of SPKI.
static char displayId[9];
static char setupCode[260];

static void halt(const char *why);

/** Signs with RFC 6979, so a weak random number can never expose the key. */
static bool signText(const char *text, size_t length, char *signatureOut) {
  uint8_t hash[32];
  uint8_t raw[SIGNATURE_BYTES];
  mbedtls_mpi r, s;
  mbedtls_mpi_init(&r);
  mbedtls_mpi_init(&s);
  bool ok = mbedtls_md(sha256Info(), (const uint8_t *)text, length, hash) == 0 &&
            mbedtls_ecdsa_sign_det_ext(&curve, &r, &s, &privateKey, hash, sizeof hash, MBEDTLS_MD_SHA256, mbedtlsRandom, nullptr) == 0 &&
            mbedtls_mpi_write_binary(&r, raw, 32) == 0 && mbedtls_mpi_write_binary(&s, raw + 32, 32) == 0;
  mbedtls_mpi_free(&r);
  mbedtls_mpi_free(&s);
  if (ok) base64url(raw, sizeof raw, signatureOut);
  return ok;
}

/** Loads this display's key, creating it the first time. It is never shown or sent. */
static void loadKey() {
  mbedtls_ecp_group_init(&curve);
  mbedtls_mpi_init(&privateKey);
  if (mbedtls_ecp_group_load(&curve, MBEDTLS_ECP_DP_SECP256R1) != 0) halt("Curve setup failed");

  uint8_t raw[32];
  if (store.isKey("key") && store.getBytes("key", raw, sizeof raw) == sizeof raw) {
    if (mbedtls_mpi_read_binary(&privateKey, raw, sizeof raw) != 0) halt("Stored key is damaged");
  } else {
    if (mbedtls_ecp_gen_privkey(&curve, &privateKey, mbedtlsRandom, nullptr) != 0 || mbedtls_mpi_write_binary(&privateKey, raw, sizeof raw) != 0) {
      halt("Key creation failed");
    }
    if (store.putBytes("key", raw, sizeof raw) != sizeof raw) halt("Key storage failed");
  }
  memset(raw, 0, sizeof raw);

  mbedtls_ecp_point point;
  mbedtls_ecp_point_init(&point);
  uint8_t spki[sizeof SPKI_PREFIX + 65];
  memcpy(spki, SPKI_PREFIX, sizeof SPKI_PREFIX);
  size_t written = 0;
  if (mbedtls_ecp_mul(&curve, &point, &privateKey, &curve.G, mbedtlsRandom, nullptr) != 0 ||
      mbedtls_ecp_point_write_binary(&curve, &point, MBEDTLS_ECP_PF_UNCOMPRESSED, &written, spki + sizeof SPKI_PREFIX, 65) != 0 || written != 65) {
    halt("Public key failed");
  }
  mbedtls_ecp_point_free(&point);
  base64url(spki, sizeof spki, publicKeyText);

  uint8_t hash[32];
  char hashText[44];
  mbedtls_md(sha256Info(), spki, sizeof spki, hash);
  base64url(hash, sizeof hash, hashText);
  memcpy(displayId, hashText, 8);
  displayId[8] = 0;

  char text[140];
  char signature[87];
  const int length = snprintf(text, sizeof text, "GCQ2|setup|%s", publicKeyText);
  if (!signText(text, length, signature)) halt("Signing failed");
  snprintf(setupCode, sizeof setupCode, "{\"v\":2,\"p\":\"setup\",\"pk\":\"%s\",\"sig\":\"%s\"}", publicKeyText, signature);
}

/** Writes a live code signed for `iat` into `out` (at least 181 bytes). */
static bool buildCode(uint32_t iat, char *out, size_t size) {
  uint8_t nonceBytes[NONCE_BYTES];
  char nonce[13];
  randomBytes(nonceBytes, sizeof nonceBytes);
  base64url(nonceBytes, sizeof nonceBytes, nonce);

  const uint32_t exp = iat + CODE_LIFETIME_SECONDS;
  char text[64];
  char signature[87];
  const int length = snprintf(text, sizeof text, "GCQ2|%s|%s|%lu|%lu|att", displayId, nonce, (unsigned long)iat, (unsigned long)exp);
  if (!signText(text, length, signature)) return false;
  snprintf(out, size, "{\"v\":2,\"d\":\"%s\",\"n\":\"%s\",\"iat\":%lu,\"exp\":%lu,\"p\":\"att\",\"sig\":\"%s\"}", displayId, nonce, (unsigned long)iat,
           (unsigned long)exp, signature);
  return true;
}

/* ----------------------------------------------------------------- Screen */

static void centered(const char *text, int y, uint8_t size) {
  tft.setTextSize(size);
  tft.setTextColor(ILI9341_BLACK, ILI9341_WHITE);
  tft.setCursor((SCREEN_WIDTH - (int)strlen(text) * 6 * size) / 2, y);
  tft.print(text);
}

/** Draws a whole message screen. `lines` are drawn small under a large title. */
static void showMessage(const char *title, const char *const *lines, size_t lineCount) {
  tft.fillScreen(ILI9341_WHITE);
  centered("GeoClockIN", 40, 2);
  centered(title, 90, 2);
  for (size_t i = 0; i < lineCount; i++) centered(lines[i], 130 + (int)i * 16, 1);
}

static void halt(const char *why) {
  Serial.printf("Stopped: %s\n", why);
  const char *lines[] = {why, "Restart the display."};
  showMessage("Something failed", lines, 2);
  while (true) delay(1000);
}

static int qrScale = 1;
static int qrBottom = 0;

/** Draws black modules on white, one row at a time, so nothing flickers between codes. */
static void drawQrModules(esp_qrcode_handle_t qr) {
  static uint16_t row[SCREEN_WIDTH];
  const int size = esp_qrcode_get_size(qr);
  const int side = size * qrScale;
  const int left = (SCREEN_WIDTH - side) / 2;
  tft.startWrite();
  tft.setAddrWindow(left, QR_TOP, side, side);
  for (int y = 0; y < size; y++) {
    for (int x = 0; x < size; x++) {
      const uint16_t color = esp_qrcode_get_module(qr, x, y) ? ILI9341_BLACK : ILI9341_WHITE;
      for (int s = 0; s < qrScale; s++) row[x * qrScale + s] = color;
    }
    for (int s = 0; s < qrScale; s++) tft.writePixels(row, side);
  }
  tft.endWrite();
  qrBottom = QR_TOP + side;
}

/** Encodes and draws `text`; `qrBottom` is then the y just below it. The QR encoder comes with the ESP32 SDK. */
static bool drawQr(const char *text, int errorCorrection, int scale) {
  qrScale = scale;
  esp_qrcode_config_t config = {};
  config.display_func = drawQrModules;
  config.max_qrcode_version = QR_MAX_VERSION;
  config.qrcode_ecc_level = errorCorrection;
  return esp_qrcode_generate(&config, text) == ESP_OK;
}

/* ------------------------------------------------------------------ Clock */

static bool rtcPresent = false;
static bool clockSet = false;
static Sync syncState = Sync::Idle;
static uint32_t syncStartedMs = 0;
static uint32_t nextSyncMs = 0;
static volatile bool ntpAnswered = false;

static uint8_t bcdToBin(uint8_t value) { return (value >> 4) * 10 + (value & 0x0f); }
static uint8_t binToBcd(uint8_t value) { return (value / 10) << 4 | value % 10; }

/** Seconds since 1970 for a UTC date, whatever the time zone setting. */
static time_t utcSeconds(int year, int month, int day, int hour, int minute, int second) {
  year -= month <= 2;
  const int era = year / 400;
  const int yearOfEra = year - era * 400;
  const int dayOfYear = (153 * (month + (month > 2 ? -3 : 9)) + 2) / 5 + day - 1;
  const int dayOfEra = yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear;
  const int64_t days = (int64_t)era * 146097 + dayOfEra - 719468;
  return days * 86400 + hour * 3600 + minute * 60 + second;
}

/** The DS3231's time in seconds since 1970, or 0 if it has none. */
static time_t readRtc() {
  // Status register: the top bit says the oscillator stopped, so the time is wrong.
  Wire.beginTransmission(RTC_ADDRESS);
  Wire.write(0x0f);
  if (Wire.endTransmission() != 0 || Wire.requestFrom(RTC_ADDRESS, (uint8_t)1) != 1) return 0;
  if (Wire.read() & 0x80) return 0;

  Wire.beginTransmission(RTC_ADDRESS);
  Wire.write(0x00);
  if (Wire.endTransmission() != 0 || Wire.requestFrom(RTC_ADDRESS, (uint8_t)7) != 7) return 0;
  uint8_t r[7];
  for (uint8_t &value : r) value = Wire.read();
  return utcSeconds(2000 + bcdToBin(r[6]), bcdToBin(r[5] & 0x1f), bcdToBin(r[4] & 0x3f), bcdToBin(r[2] & 0x3f), bcdToBin(r[1]), bcdToBin(r[0] & 0x7f));
}

static void writeRtc(time_t now) {
  struct tm utc;
  gmtime_r(&now, &utc);
  Wire.beginTransmission(RTC_ADDRESS);
  Wire.write(0x00);
  Wire.write(binToBcd(utc.tm_sec));
  Wire.write(binToBcd(utc.tm_min));
  Wire.write(binToBcd(utc.tm_hour));
  Wire.write(utc.tm_wday + 1);
  Wire.write(binToBcd(utc.tm_mday));
  Wire.write(binToBcd(utc.tm_mon + 1));
  Wire.write(binToBcd(utc.tm_year - 100));
  Wire.endTransmission();
  // The time is good again.
  Wire.beginTransmission(RTC_ADDRESS);
  Wire.write(0x0f);
  Wire.write(0x00);
  Wire.endTransmission();
}

static void onNtpAnswer(struct timeval *) { ntpAnswered = true; }

static void stopSntp() {
#if ESP_IDF_VERSION_MAJOR >= 5
  esp_sntp_stop();
#else
  sntp_stop();
#endif
}

static void startClockSync() {
  syncState = Sync::Connecting;
  syncStartedMs = millis();
  ntpAnswered = false;
  WiFi.mode(WIFI_STA);
#ifdef SIMULATOR
  WiFi.begin("Wokwi-GUEST", "", 6);
#else
  WiFi.begin();
#endif
}

static void finishClockSync(bool succeeded) {
  syncState = Sync::Idle;
  nextSyncMs = millis() + (succeeded ? SYNC_INTERVAL_MS : clockSet ? SYNC_RETRY_MS : SYNC_FIRST_RETRY_MS);
#ifndef SIMULATOR
  stopSntp();
  WiFi.disconnect(true, false);
  WiFi.mode(WIFI_OFF);
#endif
}

#ifdef SIMULATOR
// A simulation runs slower than real time when busy, so its clock falls behind
// between NTP answers while codes must carry real time. The answers show how fast
// it is running, which gives an estimate of real time. The chip needs none of this.
static float simulationSpeed = 1.0f;
static time_t lastNtpTime = 0;
static uint32_t lastNtpMs = 0;

static void noteNtpAnswer(time_t now) {
  if (lastNtpTime && now > lastNtpTime) {
    simulationSpeed = constrain((millis() - lastNtpMs) / 1000.0f / (now - lastNtpTime), 0.1f, 1.0f);
    Serial.printf("Clock set by NTP. Simulation speed: %d%% of real time\n", (int)(simulationSpeed * 100));
  } else {
    Serial.println("Clock set by NTP.");
  }
  lastNtpTime = now;
  lastNtpMs = millis();
}

/** The estimated real time, `simulatedMs` of simulated time from now. */
static time_t estimatedRealTime(uint32_t simulatedMs) { return lastNtpTime + (time_t)((millis() - lastNtpMs + simulatedMs) / 1000.0f / simulationSpeed); }
#endif

/** Moves the clock sync along without ever blocking the codes on screen. */
static void serviceClockSync() {
#ifdef SIMULATOR
  // The simulated network stays up, and NTP keeps answering on its own.
  if (ntpAnswered && syncState == Sync::Idle) {
    ntpAnswered = false;
    const time_t now = time(nullptr);
    if (now >= EARLIEST_VALID_TIME) {
      clockSet = true;
      if (rtcPresent) writeRtc(now);
      noteNtpAnswer(now);
    }
  }
#endif
  switch (syncState) {
    case Sync::Idle:
#ifndef SIMULATOR
      if ((int32_t)(millis() - nextSyncMs) >= 0) startClockSync();
#else
      if (WiFi.status() != WL_CONNECTED && (int32_t)(millis() - nextSyncMs) >= 0) startClockSync();
#endif
      break;
    case Sync::Connecting:
      if (WiFi.status() == WL_CONNECTED) {
#ifdef SIMULATOR
        sntp_set_sync_interval(SYNC_INTERVAL_MS);
#endif
        configTzTime(CLOCK_TZ, NTP_PRIMARY, NTP_SECONDARY);
        syncState = Sync::WaitingForTime;
      } else if (millis() - syncStartedMs > SYNC_TIMEOUT_MS) {
        Serial.println("Clock sync: couldn't connect to Wi-Fi.");
        finishClockSync(false);
      }
      break;
    case Sync::WaitingForTime: {
      const time_t now = time(nullptr);
      if (ntpAnswered && now >= EARLIEST_VALID_TIME) {
        ntpAnswered = false;
        clockSet = true;
        if (rtcPresent) writeRtc(now);
#ifdef SIMULATOR
        noteNtpAnswer(now);
#else
        Serial.println("Clock set by NTP.");
#endif
        finishClockSync(true);
      } else if (millis() - syncStartedMs > SYNC_TIMEOUT_MS) {
        Serial.println("Clock sync: no answer from the time servers.");
        finishClockSync(false);
      }
      break;
    }
  }
}

static void setupClock() {
  setenv("TZ", CLOCK_TZ, 1);
  tzset();
  sntp_set_time_sync_notification_cb(onNtpAnswer);

  Wire.begin(PIN_RTC_SDA, PIN_RTC_SCL);
  Wire.beginTransmission(RTC_ADDRESS);
  rtcPresent = Wire.endTransmission() == 0;
  if (rtcPresent) {
    const time_t saved = readRtc();
    if (saved >= EARLIEST_VALID_TIME) {
      struct timeval now = {saved, 0};
      settimeofday(&now, nullptr);
      clockSet = true;
      Serial.println("Clock set from the clock module.");
    }
  }
  startClockSync();
}

/* --------------------------------------------------------------- Wi-Fi setup */

#ifndef SIMULATOR
/** Runs the setup hotspot until Wi-Fi details are entered. Its password is only ever shown on this screen. */
static void runWifiSetup() {
  uint8_t raw[32];
  uint8_t mac[32];
  mbedtls_mpi_write_binary(&privateKey, raw, sizeof raw);
  mbedtls_md_hmac(sha256Info(), raw, sizeof raw, (const uint8_t *)"wifi-setup", 10, mac);
  memset(raw, 0, sizeof raw);

  static const char ALPHABET[] = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  char password[9];
  for (int i = 0; i < 8; i++) password[i] = ALPHABET[mac[i] % (sizeof ALPHABET - 1)];
  password[8] = 0;
  char hotspot[24];
  snprintf(hotspot, sizeof hotspot, "GeoClockIN-%.4s", displayId);
  char passwordLine[32];
  snprintf(passwordLine, sizeof passwordLine, "Password: %s", password);

  const char *lines[] = {"On your phone, join the Wi-Fi network:", hotspot, passwordLine, "", "Then choose the office Wi-Fi", "on the page that opens."};
  showMessage("Wi-Fi setup", lines, 6);
  Serial.printf("Wi-Fi setup: join %s\n", hotspot);

  WiFiManager manager;
  std::vector<const char *> menu = {"wifi", "exit"};
  manager.setMenu(menu);
  manager.setConfigPortalTimeout(0);
  manager.startConfigPortal(hotspot, password);
  WiFi.disconnect(true, false);
  WiFi.mode(WIFI_OFF);
}

static bool wifiIsSaved() {
  WiFiManager manager;
  return manager.getWiFiIsSaved();
}
#endif

/* ---------------------------------------------------------------- Screens */

static Mode mode = Mode::Setup;
static bool screenStale = true;
static bool waitingShown = false;
static time_t lastCodeTime = 0;

static void showSetupScreen() {
  tft.fillScreen(ILI9341_WHITE);
  if (!drawQr(setupCode, ESP_QRCODE_ECC_LOW, SETUP_QR_SCALE)) halt("Setup code too long");
  char idLine[24];
  snprintf(idLine, sizeof idLine, "Display %s", displayId);
  centered("Add this display", qrBottom + 16, 2);
  centered("Admin panel: Settings > Office QR", qrBottom + 40, 1);
  centered("> ESP32 display, and scan this code.", qrBottom + 52, 1);
  centered("Then press BOOT", qrBottom + 72, 2);
  centered(idLine, qrBottom + 98, 1);
  Serial.printf("SETUP_CODE %s\n", setupCode);
}

static void showCodeFor(time_t now) {
  static uint32_t lastTookMs = 0;
  static uint32_t codesShown = 0;
  char code[200];
  const uint32_t startedMs = millis();
#ifdef SIMULATOR
  // Making a code takes seconds here, so it is dated for when it reaches the screen.
  const uint32_t created = (uint32_t)estimatedRealTime(lastTookMs);
#else
  const uint32_t created = (uint32_t)now;
#endif
  if (!buildCode(created, code, sizeof code)) return;
  const uint32_t signedMs = millis();

  if (!drawQr(code, ESP_QRCODE_ECC_MED, CODE_QR_SCALE)) halt("Code too long");
  lastTookMs = millis() - startedMs;
  if (lastTookMs > 900 && CODE_INTERVAL_SECONDS == 1) Serial.printf("Slow: a code took %lu ms; codes will not change every second\n", (unsigned long)lastTookMs);
  // Worth checking on a new board: this has to stay well under a second.
  if (codesShown++ % 60 == 0) Serial.printf("Took %lu ms to sign, %lu ms to encode and draw\n", (unsigned long)(signedMs - startedMs), (unsigned long)(lastTookMs - (signedMs - startedMs)));

  if (screenStale) {
    char idLine[24];
    snprintf(idLine, sizeof idLine, "Display %s", displayId);
    centered("Scan in GeoClockIN", qrBottom + 18, 2);
    centered(idLine, qrBottom + 72, 1);
    screenStale = false;
  }
  struct tm local;
  localtime_r(&now, &local);
  char clock[12];
  strftime(clock, sizeof clock, "%H:%M:%S", &local);
  centered(clock, qrBottom + 44, 2);

#ifdef SIMULATOR
  Serial.printf("CODE %s\n", code);
#endif
}

static void serviceScreen() {
  if (mode == Mode::Setup) {
    if (screenStale) {
      showSetupScreen();
      screenStale = false;
    }
    return;
  }
  if (!clockSet) {
    if (!waitingShown) {
      const char *lines[] = {"Connecting to Wi-Fi to get the time.", "Codes appear once the clock is set."};
      showMessage("Setting clock...", lines, 2);
      waitingShown = true;
      screenStale = true;
    }
    return;
  }
  const time_t now = time(nullptr);
  // A clock set backwards shows a new code at once rather than waiting for it to catch up.
  if (!screenStale && now >= lastCodeTime && now - lastCodeTime < (time_t)CODE_INTERVAL_SECONDS) return;
  if (screenStale) tft.fillScreen(ILI9341_WHITE);
  waitingShown = false;
  lastCodeTime = now;
  showCodeFor(now);
}

static void setMode(Mode next) {
  mode = next;
  screenStale = true;
  waitingShown = false;
  store.putBool("live", mode == Mode::Live);
  Serial.println(mode == Mode::Live ? "Showing live codes." : "Showing the setup code.");
}

/* ----------------------------------------------------------------- Button */

// Noted by an interrupt, because the main loop is busy while it makes a code.
static volatile bool buttonDown = false;
static volatile uint32_t buttonDownMs = 0;
static volatile uint32_t buttonReleasedAfterMs = 0;
static Hold holdShown = Hold::None;

static void IRAM_ATTR onButtonChange() {
  const bool down = digitalRead(PIN_BUTTON) == LOW;
  const uint32_t nowMs = millis();
  if (down && !buttonDown) {
    buttonDown = true;
    buttonDownMs = nowMs;
  } else if (!down && buttonDown && nowMs - buttonDownMs >= BUTTON_BOUNCE_MS) {
    buttonDown = false;
    buttonReleasedAfterMs = nowMs - buttonDownMs;
  }
}

static Hold holdFor(uint32_t heldMs) {
  if (heldMs >= HOLD_ERASE_MS) return Hold::Erase;
  if (heldMs >= HOLD_WIFI_MS) return Hold::Wifi;
  if (heldMs >= HOLD_FEEDBACK_MS) return Hold::Cancel;
  return Hold::None;
}

static void eraseDisplay() {
  const char *lines[] = {"Remove this display in the admin panel,", "then add it again."};
  showMessage("Key erased", lines, 2);
  store.clear();
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true, true);
  delay(1500);
  ESP.restart();
}

static void serviceButton() {
  if (buttonDown) {
    const Hold hold = holdFor(millis() - buttonDownMs);
    if (hold != holdShown) {
      holdShown = hold;
      const char *const cancel[] = {"Keep holding to change the Wi-Fi.", "Let go to cancel."};
      const char *const wifi[] = {"Let go to change the Wi-Fi.", "Keep holding to erase this display's key."};
      const char *const erase[] = {"Let go to erase this display's key.", "It must then be added to the admin panel again."};
      if (hold == Hold::Cancel) showMessage("Holding...", cancel, 2);
      if (hold == Hold::Wifi) showMessage("Change Wi-Fi?", wifi, 2);
      if (hold == Hold::Erase) showMessage("Erase key?", erase, 2);
    }
    return;
  }
  const uint32_t heldMs = buttonReleasedAfterMs;
  if (heldMs == 0) return;
  buttonReleasedAfterMs = 0;
  holdShown = Hold::None;

  switch (holdFor(heldMs)) {
    case Hold::None:
      setMode(mode == Mode::Setup ? Mode::Live : Mode::Setup);
      break;
    case Hold::Cancel:
      screenStale = true;
      waitingShown = false;
      break;
    case Hold::Wifi:
#ifndef SIMULATOR
      if (syncState != Sync::Idle) finishClockSync(false);
      runWifiSetup();
      nextSyncMs = millis();
#endif
      screenStale = true;
      waitingShown = false;
      break;
    case Hold::Erase:
      eraseDisplay();
      break;
  }
}

/* ------------------------------------------------------------------ Start */

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  pinMode(PIN_TFT_LED, OUTPUT);
  digitalWrite(PIN_TFT_LED, HIGH);
#ifndef SIMULATOR
  setCpuFrequencyMhz(160);
#endif
  seedRandom();

  tft.begin(TFT_SPI_HZ);
  tft.setRotation(0);
  const char *lines[] = {"Starting..."};
  showMessage("Office display", lines, 1);

  store.begin("gcq", false);
  loadKey();
  Serial.printf("GeoClockIN display %s\n", displayId);

#ifndef SIMULATOR
  if (!wifiIsSaved()) runWifiSetup();
#endif
  setupClock();
  mode = store.getBool("live", false) ? Mode::Live : Mode::Setup;
  screenStale = true;
  attachInterrupt(digitalPinToInterrupt(PIN_BUTTON), onButtonChange, CHANGE);
}

void loop() {
  serviceButton();
  serviceClockSync();
  if (holdShown == Hold::None) serviceScreen();
  delay(5);
}
