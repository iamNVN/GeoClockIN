<p align="center"><img src="logo.png" alt="GeoClockIN" width="200"></p>

# GeoClockIN

Location-verified employee attendance for a single office. Employees clock in and out from
a mobile browser; the server checks that the reported location is inside the office geofence
and records the action with a server timestamp. Administrators manage employees, office
rules and reports from a desktop dashboard.

| App                   | URL                  | For                                                        |
| --------------------- | -------------------- | ---------------------------------------------------------- |
| Employee app          | `/`                  | Clock in / out, history, monthly summary, profile          |
| Admin dashboard       | `/admin`             | Attendance, employees, reports, office and rule settings   |
| Office QR display     | `/display`           | Opened on an office screen: a signed QR code, new every second |

Both apps share one API and one PostgreSQL database, so a change in the dashboard (a new
employee, a moved office pin, a new grace period) applies to the employee app immediately.

```
.
├── api/index.js            Vercel serverless entry: hands /api/* to the backend
├── backend/                Node.js + Express API
│   ├── config/             geoclockin.config.js (initial data for an empty database)
│   ├── scripts/            db migration, password hashing
│   ├── src/                app, auth, database, routes, attendance rules
│   │   └── routes/admin/   admin dashboard API
│   └── test/               unit tests (node:test)
├── frontend/
│   ├── employee/           React (Vite) employee mobile web app
│   └── admin/              React (Vite) admin dashboard, served at /admin
└── vercel.json             build, routing and security headers
```

## Getting started

### Prerequisites

- Node.js 22 or newer

That's all: `npm run dev` starts a local PostgreSQL for you (no install, no Docker). To use
your own PostgreSQL 14+ or a hosted one (for example a free [Neon](https://neon.tech)
database) instead, point `DATABASE_URL` in `backend/.env` at it.

### Run locally

```bash
npm install

# Configure the API (the defaults work locally; set a long random JWT_SECRET)
cp backend/.env.example backend/.env

# Local database on :54329, API on :3001, employee app on http://localhost:5173,
# dashboard on http://localhost:5174/admin
npm run dev
```

The local database keeps its data in `backend/.local-db/` (ignored by git), so it survives
restarts. Delete that folder to start again from the seed data. If a database is already
listening on port 54329 (for example one left running after the terminal was closed),
`npm run dev` uses it.

On first start the database is seeded from
[`backend/config/geoclockin.config.js`](backend/config/geoclockin.config.js) with these
demo accounts:

| App       | Sign in with                                | Password      | Notes            |
| --------- | ------------------------------------------- | ------------- | ---------------- |
| Admin     | admin@abctech.com                           | `Admin@123`   |                  |
| Employee  | `EMP001` or john.doe@abctech.com            | `Welcome@123` |                  |
| Employee  | `EMP002` or priya.sharma@abctech.com        | `Welcome@123` |                  |
| Employee  | `EMP003` or arjun.kumar@abctech.com         | `Welcome@123` | Inactive account |

### Testing location

Browsers only allow geolocation on secure origins. `http://localhost` counts as secure, but
`http://192.168.x.x` (your laptop's address on the Wi-Fi network) does not. That means:

- **On your computer:** move the office pin to where you are (Dashboard → Settings → Office
  Location → *My location*), or fake your position in Chrome DevTools → ⋮ → More tools →
  Sensors → Location.
- **On a phone:** use a Vercel preview deployment (HTTPS) rather than your LAN address.

### Scripts

| Command                              | What it does                                          |
| ------------------------------------ | ----------------------------------------------------- |
| `npm run dev`                        | Local database, API, employee app and dashboard with hot reload |
| `npm run dev:db`                     | Only the local database                               |
| `npm run build`                      | Production build of both apps into `dist/`            |
| `npm test`                           | Backend unit tests                                    |
| `npm run db:migrate`                 | Create or update database tables (idempotent)         |
| `npm run hash-password -- "secret"`  | Print a bcrypt hash for the seed config               |

## Admin dashboard

- **Dashboard:** today's present, absent, late and not-checked-out counts, a 7-day trend,
  department-wise attendance and recent check-ins. The date picker in the top bar switches
  the Dashboard and Attendance pages to any past day.
- **Attendance:** every employee's day with filters by department and status. Add or
  correct times, or mark someone absent; every change is kept in the audit log. Export a day
  or a date range to Excel, or import attendance from Excel (e.g. a paper register).
- **Employees:** add, edit, reset passwords, activate and deactivate (one at a time or in
  bulk). Import and export employees as Excel; download a template to fill in.
- **Reports:** any date range, department or employee. Charts plus summary, department,
  employee, employee daily, late arrival, absence and missing check-out views. *Export Report*
  downloads an Excel workbook with all of them. The **Employee Daily** report lists every day
  of each employee (weekends and holidays included) with check-in and check-out, hours, how
  late, distance from the office and any note; pick one employee for their register.
- **Settings:** company details, logo and time zone; office location (drag the pin on an
  OpenStreetMap map or search for an address) with a geofence radius slider; working hours,
  grace period, workdays, tracking start date and holidays; departments; and the admin's own
  account and password.

### Holidays

Saturdays and Sundays are off by default (**Settings → Attendance Rules → Workdays**). On
top of that, holidays are marked in both apps (a *Holiday* status, the holiday's name on the
dashboard and in the employee app's week) and never counted as absences. Someone who works on
a holiday is still recorded as present.

**Settings → Attendance Rules → Holidays** adds the Indian government holidays in one click
per year: the 17 gazetted holidays of Central Government offices (DoPT list for Delhi/New
Delhi) for 2026 and 2027, from `backend/src/lib/holidayPresets.js`. New databases start with
them. Remove any that don't apply, or add state and company holidays (e.g. Pongal) by date.
Islamic festival dates can move with the moon sighting; adjust them if DoPT announces a change.

The dashboard works on phones too: tables become stacked cards and dialogs open as bottom
sheets.

### Office QR code

An optional second check that people are really at the office, on top of their location.
A computer or tablet at the office shows a QR code that changes every second; with
**Settings → Office QR → Require the office QR code** on, clocking in or out takes three
steps:

1. **Location.** The app checks the geofence. When it passes, the server returns a signed
   *presence proof* holding the time of this check.
2. **QR scan.** The camera opens and decodes continuously (no photo to take): the moment the
   office code is in view it is sent to the server, which checks its signature and age.
   **Clock In / Clock Out** stays disabled until this succeeds.
3. **Confirm.** The recorded time is the **location check time** from step 1, not the time
   of the scan or of the tap. The proof is valid for 3 minutes; after that the app checks
   the location again.

**Setting up a display** (nothing to install)

1. On the office computer or tablet, open **`https://<your-app>/display`** (locally
   `http://localhost:5173/display`) and click once for full screen. The link is also in
   **Settings → Office QR**, with a Copy button.
2. The screen shows a pairing code such as `K7QM-9XP2`. In **Settings → Office QR**, enter it
   with a name such as "Reception" and click **Pair Display**. Within a few seconds the
   screen switches to the QR code.
3. Turn on **Require the office QR code** and save.

To retire a screen, remove it in the same place: its codes stop working at once, and the
screen goes back to showing a pairing code.

**Why codes can't be faked**

- The first time a browser opens `/display`, it creates its own ECDSA P-256 key pair. The
  private key is created *non-extractable* and kept in that browser's storage: the page can
  sign with it, but nobody can copy it out. GeoClockIN only stores the public keys of the
  displays an admin paired.
- Each code is `GCQ1.<display key id>.<unix time>.<signature>`. Changing the time breaks the
  signature; a code from a screen that wasn't paired is rejected. So an employee who opens the
  link at home only ever sees a pairing code, and nothing it could produce is accepted.
- A code is accepted for 5 seconds (and up to 2 seconds early, for clock differences; the
  page keeps its clock in step with the server), so a photo or screenshot sent to someone
  outside is useless almost at once.
- Every scan, accepted or not, is logged in `attendance_attempts`; the attendance table shows
  *QR* next to the distance, and exports have an *Office QR* column.

Clearing the display browser's site data (or using a private window) creates a new key, so
the screen has to be paired again. The QR code makes cheating much harder but not
impossible: someone at the office could still stream the live code to a colleague who is
also faking their GPS position.

### Company logo

Upload a PNG, JPG, WebP or SVG (up to 2 MB) in **Settings → General**. It replaces the
GeoClockIN logo in both apps: the dashboard at once, the employee app the next time it is
opened (it is cached for up to five minutes). **Remove** restores the default. The logo is
stored in the database and served from `/api/branding/logo`.

### Excel import formats

The templates (**Employees → ⋯ → Download import template**, or *Download the template* in
either import dialog) are empty sheets: fill in the first sheet. Its cells are formatted as text so Excel keeps
dates and times as typed, and drop-downs offer the departments, statuses and employee IDs.
A second sheet, *How to fill*, explains the columns and shows an example row. Headers are matched
loosely (e.g. "Employee ID", "Emp ID" or "ID"). Imports are all-or-nothing: if any row is
invalid, nothing is saved and every problem is listed with its row number.

| Import      | Columns                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------- |
| Employees   | Employee ID, Name, Email, Phone, Department, Designation, Joined On, Status, Password      |
| Attendance  | Employee ID, Date, Check In, Check Out, Note                                               |

- Existing Employee IDs are updated; new ones are added (Password is required for those).
  New departments are added to Settings automatically.
- Attendance replaces any existing record for the same employee and date. Times can be typed
  (`09:05`, `6:00 PM`) or Excel time cells, in the office time zone.

## Configuration

Organisation settings, employees and admins live in the database and are edited from the
dashboard. [`backend/config/geoclockin.config.js`](backend/config/geoclockin.config.js) is
only used once, to seed an empty database; editing it afterwards changes nothing.

Environment variables (`backend/.env` locally, Project Settings → Environment Variables on Vercel):

| Variable         | Required          | Description                                                        |
| ---------------- | ----------------- | ------------------------------------------------------------------ |
| `DATABASE_URL`   | yes               | PostgreSQL connection string                                       |
| `JWT_SECRET`     | yes in production | Long random string used to sign session cookies                    |
| `ADMIN_EMAIL`    | no                | Email of the first admin when the database is created              |
| `ADMIN_PASSWORD` | yes on Vercel     | Password of the first admin (replaces the demo `Admin@123`)        |
| `SMTP_HOST`      | for password reset | SMTP server for reset emails, e.g. `smtp.gmail.com`               |
| `SMTP_PORT`      | no                | `465` (TLS) or `587` (STARTTLS, the default)                       |
| `SMTP_USER`, `SMTP_PASS` | for password reset | SMTP login (for Gmail, an [app password](https://myaccount.google.com/apppasswords)) |
| `MAIL_FROM`      | no                | Sender, e.g. `GeoClockIN <no-reply@yourcompany.com>` (default `SMTP_USER`) |
| `APP_URL`        | no                | Public address used in reset links (default: the Vercel production domain) |
| `PORT`           | no                | Local API port (default `3001`)                                    |

### Password reset emails

"Forgot password?" in both apps emails a one-time link that expires after 30 minutes. Any
SMTP provider works:

| Provider | `SMTP_HOST`            | `SMTP_PORT` | `SMTP_USER`                    | `SMTP_PASS`             |
| -------- | ---------------------- | ----------- | ------------------------------ | ----------------------- |
| Gmail    | `smtp.gmail.com`       | `465`       | your Gmail address             | a Google app password   |
| Brevo    | `smtp-relay.brevo.com` | `587`       | the SMTP login from Brevo      | the Brevo SMTP key      |
| Resend   | `smtp.resend.com`      | `465`       | `resend`                       | a Resend API key        |

Locally, without `SMTP_HOST`, the API prints the email (and its link) to the terminal instead
of sending it. On Vercel, without `SMTP_HOST`, "Forgot password?" explains that reset by
email isn't set up and nothing is sent.

## Deploying to Vercel

1. Push this repository to GitHub and import it in Vercel. Keep the **root directory** as the
   repository root; `vercel.json` sets the build command, the output directory (`dist`) and
   the routing for `/`, `/admin` and `/api`.
2. Add a database: **Storage → Create → Neon (Postgres)**, then connect it to the project.
   This sets `DATABASE_URL`. Any other PostgreSQL works too; set `DATABASE_URL` yourself and
   include `?sslmode=require` for hosted databases.
3. Add `JWT_SECRET` under **Settings → Environment Variables**. You can generate one with:
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
4. Set `ADMIN_PASSWORD` (and optionally `ADMIN_EMAIL`) to create the first admin account.
   Deployments never use the published demo password: until `ADMIN_PASSWORD` is set (and the
   project redeployed) nobody can sign in to `/admin`. If the database already has an admin,
   change its password in **Settings → Account & Security** instead.
5. For "Forgot password?", add the `SMTP_*` variables (see [Password reset emails](#password-reset-emails)).
6. Deploy. Tables are created or migrated automatically on the first request. Check
   `https://<your-app>.vercel.app/api/health`; it should return `{"status":"ok","database":"ok"}`.

The apps and the API are served from the same domain, so session cookies are first-party
(`HttpOnly`, `Secure`, `SameSite=Strict`) and no CORS setup is needed. Employees and admins
have separate cookies.

## Attendance rules

- **Work date and time:** the time of the location check that preceded the clock-in or
  clock-out (in the office time zone), not the time the button was tapped.
- **Check-in:** one per employee per work date. The server rejects duplicates, and the
  database's unique `(employee_id, work_date)` constraint guarantees it even when two
  requests arrive at the same moment.
- **Check-out:** only after that day's check-in, and only once. Shifts that cross midnight
  are not supported.
- **Location:** both check-in and check-out need a fresh location reading that passes the
  geofence policy:
  - If even the nearest edge of the accuracy circle is outside the radius → *outside the
    office area*.
  - Else, if the reported accuracy is worse than ±100 m → *weak signal* (move near a window
    and retry). The limit is fixed in `backend/src/lib/geo.js`.
  - Else, if the reported point is outside the radius → *outside the office area*.
  - Otherwise → accepted.
- **Late:** a workday check-in after work start + grace period (to the second). Late status
  is fixed at check-in time; an admin correction recalculates it.
- **Absent:** a workday (not a weekend or holiday, on or after the tracking start date and
  the employee's joining date) with no check-in, once the day is over. Today counts once work
  end has passed. Deactivated employees stop counting from the day they were deactivated.
- **Missing check-out:** a past day with a check-in but no check-out.

## API

All endpoints are under `/api` and return JSON. Errors look like
`{ "error": { "code": "...", "message": "..." } }`, and `message` is safe to show to the user.

### Employee app

| Method | Path                               | Description                                                      |
| ------ | ---------------------------------- | ---------------------------------------------------------------- |
| GET    | `/health`                          | Service and database health, and the server time                 |
| POST   | `/auth/login`                      | `{ identifier, password, rememberMe }`. Sets the session cookie  |
| POST   | `/auth/logout`                     | Clears the session cookie                                        |
| GET    | `/auth/me`                         | Signed-in employee, office and schedule                          |
| POST   | `/auth/forgot-password`            | `{ identifier }`. Emails a reset link; same answer for unknown accounts |
| POST   | `/auth/reset-password/check`       | `{ token }` → `{ valid }`                                        |
| POST   | `/auth/reset-password`             | `{ token, password }`. Sets the password and ends all sessions   |
| GET    | `/attendance/overview`             | Today, this week, this month and recent days (home screen)       |
| GET    | `/attendance/today`                | Today's record, status and allowed next action                   |
| POST   | `/attendance/verify-location`      | `{ latitude, longitude, accuracy, action }` (`check_in` / `check_out`). Geofence check; when it passes, `presence: { token, at, qrRequired }` |
| POST   | `/attendance/verify-qr`            | `{ action, presence, code }`: the scanned office code. Returns an upgraded `presence` |
| POST   | `/attendance/check-in`             | `{ presence }`. Records the location check time               |
| POST   | `/attendance/check-out`            | `{ presence }`                                                  |
| POST   | `/displays/status`                 | `{ publicKey }` from the display page: `approved` (with its name) or `pending` with a pairing code |
| GET    | `/attendance/history?month=YYYY-MM`| Days of the month (newest first) and a monthly summary           |

Attendance endpoints only ever return the signed-in employee's own records.

### Admin dashboard (`/api/admin`, admin session required)

| Method   | Path                                   | Description                                             |
| -------- | -------------------------------------- | ------------------------------------------------------- |
| POST     | `/auth/login`, `/auth/logout`          | `{ email, password, rememberMe }`                       |
| GET      | `/auth/me`                             | Signed-in admin and organisation                        |
| PUT      | `/auth/account`                        | Change name, email or password (current password required) |
| POST     | `/auth/forgot-password`, `/auth/reset-password/check`, `/auth/reset-password` | As for employees, with `{ email }`; no session needed |
| GET      | `/overview?date=`                      | KPIs, 7-day trend, departments, recent activity         |
| GET      | `/attendance?date=`                    | Every employee's status for a day                       |
| PUT      | `/attendance/:employeeId/:date`        | `{ checkIn, checkOut, note }`; `checkIn: null` marks absent |
| GET      | `/attendance/export?date=` or `?from=&to=` | Excel export                                        |
| GET/POST | `/attendance/template`, `/attendance/import` | Import template; upload a .xlsx                   |
| GET/POST | `/employees`                           | List with stats; create                                 |
| PUT      | `/employees/:id`                       | Update (including password reset)                       |
| POST     | `/employees/status`                    | `{ ids, active }` bulk activate / deactivate            |
| GET/POST | `/employees/export`, `/employees/template`, `/employees/import` | Excel export, template, import |
| GET      | `/reports?from=&to=&department=&employee=` | Range statistics                                    |
| GET      | `/reports/daily?from=&to=&department=&employee=` | Employee daily rows (first 5,000; the export has all) |
| GET      | `/reports/export?…&type=`              | Excel workbook (`summary`, `department`, `employee`, `daily`, `late`, `absent`, `not_checked_out`) |
| GET/PUT  | `/settings`                            | Organisation settings                                   |
| POST     | `/settings/displays`                   | `{ code, name }`: pair the office display showing `code` |
| DELETE   | `/settings/displays/:id`               | Remove an office display; its codes stop working        |

## Security and privacy

- Passwords are stored as bcrypt hashes. Login failures for an unknown account and a wrong
  password return the same message and take the same time.
- Sessions are signed JWTs in `HttpOnly`, `Secure`, `SameSite=Strict` cookies: 12 hours, or
  30 days with *Remember me*. Employee and admin sessions are separate; neither can call the
  other's API.
- **Password reset links** carry a random 256-bit token in the URL fragment (never sent to the
  server in logs or `Referer` headers). Only its SHA-256 hash is stored; a link works once,
  expires after 30 minutes, and a newer link replaces older ones. An account gets at most one
  email a minute and five an hour, and the reply is the same whether or not the account
  exists. A reset signs the account out on every device.
- The browser never decides anything about attendance. Sequence rules, the geofence and all
  timestamps are enforced on the server.
- **Location data minimisation:** coordinates are used only to compute the distance. The
  database stores the distance from the office and the reading's accuracy, never the
  coordinates. Every attempt, accepted or rejected, is written to `attendance_attempts`.
- **Audit log:** employee changes, imports, settings changes and attendance corrections are
  written to `audit_log` with the admin's email and before/after details.
- Browser geolocation can be spoofed. GeoClockIN makes spoofing harder to do casually, but
  it does not guarantee physical presence.

## Not yet included

Google Sheets sync, multiple offices, leave management and login rate limiting.
