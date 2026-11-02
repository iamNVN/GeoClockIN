# GeoClockIN ESP32 display

A small office display that shows the Office QR code without a computer. It signs a new code
every second with a private key that never leaves the board, and it never contacts GeoClockIN:
the server recognises its codes from the public key an admin added in the dashboard.

Wi-Fi is only used to set the clock (NTP), for a few seconds each hour. The optional DS3231
module keeps the time when the internet is down or the power is cut.

## Parts

Approximate online prices in India, November 2026, for one display.

| Part                                                 | Price         |
| ---------------------------------------------------- | ------------- |
| ESP32 DevKit V1 (WROOM-32, 30-pin)                   | ₹350–560      |
| 2.8" SPI TFT 240×320, ILI9341, non-touch             | ₹650–750      |
| DS3231 clock module and CR2032 cell (recommended)    | ₹150–220      |
| 5 V 2 A adapter and USB cable                        | ₹220–270      |
| Jumper wires, headers, small perfboard               | ₹50–100       |
| Case: 3D-printed, or a 110×70×30 mm ABS box          | ₹150–450      |
| **Total**                                            | **≈ ₹1,600–2,200** |

The screen only ever shows black and white. A colour TFT is still the right part: e-paper can't
change every second, and cheap mono OLEDs have too few pixels for a signed code.

## Wiring

| Screen pin      | ESP32 pin    |     | DS3231 pin | ESP32 pin |
| --------------- | ------------ | --- | ---------- | --------- |
| VCC / GND       | 3V3 / GND    |     | VCC / GND  | 3V3 / GND |
| CS              | GPIO 15      |     | SDA        | GPIO 21   |
| DC              | GPIO 2       |     | SCL        | GPIO 22   |
| RESET           | GPIO 4       |     |            |           |
| MOSI / SCK      | GPIO 23 / 18 |     |            |           |
| LED (backlight) | GPIO 32      |     |            |           |

## Build and flash

With [PlatformIO](https://platformio.org/) (the VS Code extension or `pip install platformio`):

```bash
cd firmware/esp32-display
pio run -e esp32dev -t upload
pio device monitor
```

## Setting it up

1. **Wi-Fi.** On first boot the screen names a hotspot and its password. Join it from a phone and
   choose the office Wi-Fi on the page that opens.
2. **Add it.** The screen shows a setup code. In the dashboard, open **Settings → Office QR → ESP32
   display**, name the display, and click **Scan** (or paste the `SETUP_CODE` line from the serial log).
3. **Go live.** Press **BOOT** on the display. It switches to live codes, and stays on them after
   a restart.

| BOOT button                | What it does                                                 |
| -------------------------- | ------------------------------------------------------------ |
| Press                      | Switch between the setup code and live codes                 |
| Hold 5 s, then let go      | Change the Wi-Fi                                             |
| Hold 15 s, then let go     | Erase the key: remove the display in the dashboard and add it again |

## What a code contains

```json
{"v":2,"d":"Xk3J9xQ2","n":"q7Zp2LmX9aT4","iat":1793520000,"exp":1793520005,"p":"att","sig":"…"}
```

| Field | Meaning                                                                     |
| ----- | --------------------------------------------------------------------------- |
| `v`   | Format version                                                              |
| `d`   | Display id: the first 8 characters of the public key's SHA-256 hash         |
| `n`   | Nonce: 9 random bytes                                                       |
| `iat` | Created (Unix seconds)                                                      |
| `exp` | Expires: `iat` + 5                                                          |
| `p`   | Purpose: `att` for attendance. A setup code has `setup`, so one can't pass as the other |
| `sig` | ECDSA P-256 signature (r‖s, base64url) of `GCQ2\|d\|n\|iat\|exp\|p`         |

A code is 180 bytes, which is exactly what a version 9 QR code holds at medium error correction.
`backend/src/lib/qrToken.js` verifies it.

A server-sent challenge would need the two-way connection this display avoids. The unpredictable
nonce, the 5-second expiry and the server's record of used nonces do that job instead.

## Testing without a board

[Wokwi](https://wokwi.com) simulates the ESP32, the screen, the clock module, the button and Wi-Fi,
and runs this firmware unchanged apart from the `SIMULATOR` setting. `diagram.json` has the wiring.

**In the browser** (no install or account):

1. Open <https://wokwi.com/projects/new/esp32>.
2. Paste `src/main.cpp` into `sketch.ino`, and uncomment the `// #define SIMULATOR` line near the top.
3. Paste `diagram.json` into `diagram.json`.
4. Press the green start button. The first builds stop to ask for **Adafruit GFX Library** and
   **Adafruit ILI9341**: click Install in each, then press start again.

**In VS Code:** install the PlatformIO and Wokwi extensions, run `pio run -e wokwi` in this folder,
then run **Wokwi: Start Simulator** (use **Wokwi: Select Config File** to choose this folder's
`wokwi.toml`). It asks you to sign in to Wokwi for a licence.

**Then try it:**

1. Copy the `SETUP_CODE` JSON from the serial monitor into **Settings → Office QR → ESP32 display**, or
   scan the simulated screen with the dashboard open on a phone.
2. Click the green **BOOT** button in the diagram. The live code appears.
3. Open the employee app on a phone, pass the location check, and point the camera at the monitor.
   The phone keeps scanning until it sees a code that is in date, so give it up to 15 seconds.

**Checks worth trying:**

| Try this                                                 | Expected                                      |
| -------------------------------------------------------- | --------------------------------------------- |
| Scan before adding the display in the dashboard          | "…a display that isn't registered"            |
| Scan the setup code in the employee app                  | "This display is still in setup"              |
| Paste a live code into the dashboard's setup form        | "This is the display's live code…"            |
| Photograph a code, then scan the photo a minute later    | "This QR code has expired"                    |
| Add the display, then remove it, then scan               | "…a display that isn't registered"            |
| Change one letter of a code and send it to `/attendance/verify-qr` | `QR_INVALID`                        |

**Where the simulator differs from a board:**

| | Simulator | Board |
| ---- | --------- | ----- |
| New code | About every 8 s | Every second |
| Time per code | About 3.5 s, because Wokwi limits its CPU to about 8 MHz | Should be about 0.2 s; the serial log prints the real figure once a minute |
| Clock | Estimated from NTP, as the simulation runs slower than real time | The chip's clock, NTP every hour |
| Wi-Fi setup hotspot | Skipped: uses the simulated network | Used on first boot |
| Key | New on every run, so the display has to be added again | Kept across restarts |

So check these on the first real board: the hotspot setup, codes changing every second (watch the
`Took … ms` line), the backlight, scanning at an angle under office lights, and the clock module
keeping time with the Wi-Fi off.

## Before installing for real

The private key is stored in the board's flash. Until the steps below are done, someone with the
board and a USB cable could read it out and make valid codes elsewhere. The remedy for a stolen
display is the same either way: remove it in the dashboard and its codes stop working at once.

For displays going on a wall, enable the ESP32's flash encryption and Secure Boot V2 and disable
its serial download mode (Espressif's
[security guide](https://docs.espressif.com/projects/esp-idf/en/v4.4/esp32/security/flash-encryption.html)
covers this). These settings are burned into the chip and **can't be undone**, so do this only
after everything else works, and try it on a spare board first. It needs a real board, and has
not been tried with this firmware yet.
