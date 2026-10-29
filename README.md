# GeoClockIN

Location-verified employee attendance for a single office. Employees clock in and out from
a mobile browser; the server checks that the reported location is inside the office geofence
and records the action with a server timestamp.

**Phase 1** is the employee web app. The admin dashboard is planned for Phase 2. Until then,
the office, geofence, work schedule and employee accounts live in a config file.

```
.
├── api/index.js            Vercel serverless entry: hands /api/* to the backend
├── backend/                Node.js + Express API
│   ├── config/             geoclockin.config.js (office, schedule, employees)
│   ├── scripts/            db migration, password hashing
│   ├── src/                app, auth, database, routes, attendance rules
│   └── test/               unit tests (node:test)
├── frontend/
│   ├── employee/           React (Vite) employee mobile web app
│   └── admin/              Phase 2 placeholder
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

# Start the API (http://localhost:3001) and the employee app (http://localhost:5173)
npm run dev
```

Open http://localhost:5173 and sign in with a demo account:

| Employee ID | Email                     | Password      | Notes            |
| ----------- | ------------------------- | ------------- | ---------------- |
| `EMP001`    | john.doe@abctech.com      | `Welcome@123` |                  |
| `EMP002`    | priya.sharma@abctech.com  | `Welcome@123` |                  |
| `EMP003`    | arjun.kumar@abctech.com   | `Welcome@123` | Inactive account |

### Testing location

Browsers only allow geolocation on secure origins. `http://localhost` counts as secure, but
`http://192.168.x.x` (your laptop's address on the Wi-Fi network) does not. That means:

- **On your computer:** either set `office.latitude`/`longitude` in the config to where you
  are, or keep the config and fake your position in Chrome DevTools → ⋮ → More tools →
  Sensors → Location.
- **On a phone:** use a Vercel preview deployment (HTTPS) rather than your LAN address.

### Scripts

| Command                              | What it does                                  |
| ------------------------------------ | --------------------------------------------- |
| `npm run dev`                        | API and employee app with hot reload          |
| `npm run build`                      | Production build of the employee app          |
| `npm test`                           | Backend unit tests                            |
| `npm run db:migrate`                 | Create database tables (idempotent)           |
| `npm run hash-password -- "secret"`  | Print a bcrypt hash for the config file       |

## Configuration

Everything lives in [`backend/config/geoclockin.config.js`](backend/config/geoclockin.config.js).
The file is validated at startup, and a mistake stops the server with a clear message.

| Setting                                  | Meaning                                                              |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `office.latitude`, `office.longitude`    | Office coordinates (decimal degrees)                                 |
| `office.radiusMeters`                    | Geofence radius; attendance is only accepted inside it               |
| `location.maxAccuracyMeters`             | Location readings less precise than this are rejected                |
| `schedule.timezone`                      | IANA time zone for work dates, late status and displayed times       |
| `schedule.workStart` / `workEnd`         | `HH:MM`, 24-hour                                                     |
| `schedule.graceMinutes`                  | Check-ins after `workStart` + grace are marked late                  |
| `schedule.workdays`                      | Weekday numbers, `0` = Sunday … `6` = Saturday                       |
| `schedule.holidays`                      | `YYYY-MM-DD` dates that are not counted as absences                  |
| `schedule.trackingStartDate`             | Go-live date; no absences are counted before it                      |
| `employees[]`                            | `id`, `name`, `email`, `designation`, `department`, `phone`, `joinedOn`, `active`, `passwordHash` |

To add an employee, generate a hash with `npm run hash-password -- "their-password"` and add
an entry to `employees`. To deactivate someone, set `active: false`; that also ends any
session they still have open.

Environment variables (`backend/.env` locally, Project Settings → Environment Variables on Vercel):

| Variable       | Required          | Description                                        |
| -------------- | ----------------- | -------------------------------------------------- |
| `DATABASE_URL` | yes               | PostgreSQL connection string                       |
| `JWT_SECRET`   | yes in production | Long random string used to sign session cookies    |
| `PORT`         | no                | Local API port (default `3001`)                    |

## Deploying to Vercel

1. Push this repository to GitHub and import it in Vercel. Keep the **root directory** as the
   repository root; `vercel.json` already sets the build command, the output directory
   (`frontend/employee/dist`) and the routing.
2. Add a database: **Storage → Create → Neon (Postgres)**, then connect it to the project.
   This sets `DATABASE_URL`. Any other PostgreSQL works too; set `DATABASE_URL` yourself and
   include `?sslmode=require` for hosted databases.
3. Add `JWT_SECRET` under **Settings → Environment Variables**. You can generate one with:
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
4. Deploy. Tables are created automatically on the first request. Check
   `https://<your-app>.vercel.app/api/health`; it should return `{"status":"ok","database":"ok"}`.

The employee app and the API are served from the same domain, so the session cookie is
first-party (`HttpOnly`, `Secure`, `SameSite=Strict`) and no CORS setup is needed.

## Attendance rules

- **Work date:** the calendar date in `schedule.timezone` when the server receives the request.
- **Check-in:** one per employee per work date. The server rejects duplicates, and the
  database's unique `(employee_id, work_date)` constraint guarantees it even when two
  requests arrive at the same moment.
- **Check-out:** only after that day's check-in, and only once. Shifts that cross midnight
  are not supported in Phase 1.
- **Location:** both check-in and check-out need a fresh location reading that passes the
  geofence policy:
  - If even the nearest edge of the accuracy circle is outside the radius → *outside the
    office area*.
  - Else, if the reported accuracy is worse than `maxAccuracyMeters` → *not precise enough*
    (move near a window and retry).
  - Else, if the reported point is outside the radius → *outside the office area*.
  - Otherwise → accepted.
- **Late:** a workday check-in after `workStart + graceMinutes` (to the second). Late status
  is fixed at check-in time.
- **Absent:** a workday (not a weekend or holiday, on or after the employee's tracking start)
  with no check-in, once the day is over. Today counts once `workEnd` has passed.
- **Missing check-out:** a past day with a check-in but no check-out is flagged in history.

## API

All endpoints are under `/api` and return JSON. Errors look like
`{ "error": { "code": "...", "message": "..." } }`, and `message` is safe to show to the user.

| Method | Path                               | Description                                                      |
| ------ | ---------------------------------- | ---------------------------------------------------------------- |
| GET    | `/health`                          | Service and database health                                      |
| POST   | `/auth/login`                      | `{ identifier, password, rememberMe }`. Sets the session cookie  |
| POST   | `/auth/logout`                     | Clears the session cookie                                        |
| GET    | `/auth/me`                         | Signed-in employee, office and schedule                          |
| GET    | `/attendance/today`                | Today's record, status and allowed next action                   |
| POST   | `/attendance/verify-location`      | `{ latitude, longitude, accuracy }`. Geofence check only, nothing is stored |
| POST   | `/attendance/check-in`             | `{ latitude, longitude, accuracy }`                              |
| POST   | `/attendance/check-out`            | `{ latitude, longitude, accuracy }`                              |
| GET    | `/attendance/history?month=YYYY-MM`| Days of the month (newest first) and a monthly summary           |

Main error codes: `INVALID_CREDENTIALS`, `ACCOUNT_INACTIVE`, `UNAUTHENTICATED`,
`INVALID_COORDINATES`, `LOCATION_OUTSIDE_RADIUS`, `LOCATION_POOR_ACCURACY` (both with a
`verification` object), `ALREADY_CHECKED_IN`, `NOT_CHECKED_IN`, `ALREADY_CHECKED_OUT`,
`SERVICE_UNAVAILABLE`.

Attendance endpoints only ever return the signed-in employee's own records.

## Security and privacy

- Passwords are stored as bcrypt hashes. Login failures for an unknown ID and a wrong
  password return the same message and take the same time.
- Sessions are signed JWTs in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie: 12 hours,
  or 30 days with *Remember me*.
- The browser never decides anything about attendance. Sequence rules, the geofence and all
  timestamps are enforced on the server.
- **Location data minimisation:** coordinates are used only to compute the distance. The
  database stores the distance from the office and the reading's accuracy, never the
  coordinates. Every attempt, accepted or rejected, is written to `attendance_attempts` for
  auditing.
- Browser geolocation can be spoofed. GeoClockIN makes spoofing harder to do casually, but
  it does not guarantee physical presence.

## Phase 1 scope

Included: sign-in, home with live status, location-verified clock in/out, attendance
history with filters and day details, monthly summary, and profile.

Not yet included: admin dashboard, employee management UI, reports/export, Google Sheets
sync, attendance corrections, password reset, and login rate limiting.
