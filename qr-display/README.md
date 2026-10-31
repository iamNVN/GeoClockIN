# GeoClockIN office QR display

Shows a QR code that changes every second, for employees to scan after the location check
when clocking in or out. Each code is signed with this display's own private key, so it can't
be forged, and it is only accepted for 10 seconds, so a photo of it is useless.

## Run it

Needs Node.js 22 or newer.

```bash
npm install
npm start
```

On first start it creates `display-key.pem` (the private key: keep it on this computer) and
prints the **display key**. In the GeoClockIN dashboard, add that key under
**Settings → Office QR → Office Displays**, save, then turn on **Require the office QR code**.

Open `http://localhost:4100` and click once for full screen. The screen stays on while the
page is open.

## Options

Set these as environment variables or in a `.env` file next to `server.js`:

| Variable         | Default     | Meaning                                                                 |
| ---------------- | ----------- | ----------------------------------------------------------------------- |
| `PORT`           | `4100`      | Port of the page                                                        |
| `HOST`           | `127.0.0.1` | `0.0.0.0` lets a tablet on the office network open the page             |
| `GEOCLOCKIN_URL` | (none)      | e.g. `https://geoclockin.vercel.app`: keeps the codes on GeoClockIN's time |

If scans fail with "expired" or "ahead", this computer's clock is off: turn on automatic time
or set `GEOCLOCKIN_URL`. Deleting `display-key.pem` creates a new key, which has to be added
in GeoClockIN again.
