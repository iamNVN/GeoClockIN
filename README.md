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
- PostgreSQL 14 or newer, either installed locally
  ([postgresql.org/download](https://www.postgresql.org/download/)) or hosted
  (for example a free [Neon](https://neon.tech) database)

### Run locally

```bash
npm install

# Configure the API
cp backend/.env.example backend/.env
#   then edit DATABASE_URL and JWT_SECRET in backend/.env

# Optional: create the tables now (the API also creates them on first use)
npm run db:migrate

# API on :3001, employee app on http://localhost:5173, dashboard on http://localhost:5174/admin
npm run dev
```

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
| `npm run dev`                        | API, employee app and dashboard with hot reload       |
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
  employee, late arrival, absence and missing check-out views. *Export Report* downloads an
  Excel workbook with all of them.
- **Settings:** company details, logo and time zone; office location (drag the pin on an
  OpenStreetMap map or search for an address) with a geofence radius slider; working hours,
  grace period, workdays, tracking start date and holidays; departments; and the admin's own
  account and password.

The dashboard works on phones too: tables become stacked cards and dialogs open as bottom
sheets.

### Company logo

Upload a PNG, JPG, WebP or SVG (up to 2 MB) in **Settings → General**. It replaces the
GeoClockIN logo in both apps: the dashboard at once, the employee app the next time it is
opened (it is cached for up to five minutes). **Remove** restores the default. The logo is
stored in the database and served from `/api/branding/logo`.

### Excel import formats

Download the template from the dashboard to get the exact headers. Headers are matched
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
| `ADMIN_PASSWORD` | recommended       | Password of the first admin (replaces the demo `Admin@123`)        |
| `PORT`           | no                | Local API port (default `3001`)                                    |

## Deploying to Vercel

1. Push this repository to GitHub and import it in Vercel. Keep the **root directory** as the
   repository root; `vercel.json` sets the build command, the output directory (`dist`) and
   the routing for `/`, `/admin` and `/api`.
2. Add a database: **Storage → Create → Neon (Postgres)**, then connect it to the project.
   This sets `DATABASE_URL`. Any other PostgreSQL works too; set `DATABASE_URL` yourself and
   include `?sslmode=require` for hosted databases.
3. Add `JWT_SECRET` under **Settings → Environment Variables**. You can generate one with:
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
4. Set `ADMIN_PASSWORD` (and optionally `ADMIN_EMAIL`) **before the first deploy**, so the
   first admin account doesn't use the published demo password. If the database already has
   an admin, change its password in **Settings → Account & Security** instead.
5. Deploy. Tables are created or migrated automatically on the first request. Check
   `https://<your-app>.vercel.app/api/health`; it should return `{"status":"ok","database":"ok"}`.

The apps and the API are served from the same domain, so session cookies are first-party
(`HttpOnly`, `Secure`, `SameSite=Strict`) and no CORS setup is needed. Employees and admins
have separate cookies.

## Attendance rules

- **Work date:** the calendar date in the office time zone when the server receives the request.
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
| GET    | `/health`                          | Service and database health                                      |
| POST   | `/auth/login`                      | `{ identifier, password, rememberMe }`. Sets the session cookie  |
| POST   | `/auth/logout`                     | Clears the session cookie                                        |
| GET    | `/auth/me`                         | Signed-in employee, office and schedule                          |
| GET    | `/attendance/overview`             | Today, this week, this month and recent days (home screen)       |
| GET    | `/attendance/today`                | Today's record, status and allowed next action                   |
| POST   | `/attendance/verify-location`      | `{ latitude, longitude, accuracy }`. Geofence check only, nothing is stored |
| POST   | `/attendance/check-in`             | `{ latitude, longitude, accuracy }`                              |
| POST   | `/attendance/check-out`            | `{ latitude, longitude, accuracy }`                              |
| GET    | `/attendance/history?month=YYYY-MM`| Days of the month (newest first) and a monthly summary           |

Attendance endpoints only ever return the signed-in employee's own records.

### Admin dashboard (`/api/admin`, admin session required)

| Method   | Path                                   | Description                                             |
| -------- | -------------------------------------- | ------------------------------------------------------- |
| POST     | `/auth/login`, `/auth/logout`          | `{ email, password, rememberMe }`                       |
| GET      | `/auth/me`                             | Signed-in admin and organisation                        |
| PUT      | `/auth/account`                        | Change name, email or password (current password required) |
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
| GET      | `/reports/export?…&type=`              | Excel workbook                                          |
| GET/PUT  | `/settings`                            | Organisation settings                                   |

## Security and privacy

- Passwords are stored as bcrypt hashes. Login failures for an unknown account and a wrong
  password return the same message and take the same time.
- Sessions are signed JWTs in `HttpOnly`, `Secure`, `SameSite=Strict` cookies: 12 hours, or
  30 days with *Remember me*. Employee and admin sessions are separate; neither can call the
  other's API.
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

Google Sheets sync, self-service password reset, multiple offices, leave management and
login rate limiting.
