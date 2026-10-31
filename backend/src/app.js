import cookieParser from 'cookie-parser';
import express from 'express';
import { query } from './db.js';
import { HttpError } from './errors.js';
import adminRoutes from './routes/admin/index.js';
import attendanceRoutes from './routes/attendance.js';
import brandingRoutes from './routes/branding.js';
import displayRoutes from './routes/displays.js';
import authRoutes from './routes/auth.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1');
    // `time` lets the office QR display keep its clock in step with the server.
    res.json({ status: 'ok', database: 'ok', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'unavailable' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/branding', brandingRoutes);
app.use('/api/displays', displayRoutes);

app.use('/api', () => {
  throw new HttpError(404, 'NOT_FOUND', 'This API endpoint does not exist.');
});

const DB_CONNECTION_ERRORS = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', '57P03', '53300']);

// Express recognises error handlers by their four parameters.
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message }, ...err.details });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'The file is too large to upload.' } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'The request could not be read.' } });
  }

  console.error(err);
  if (DB_CONNECTION_ERRORS.has(err.code) || /timeout/i.test(err.message ?? '')) {
    return res.status(503).json({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'The attendance service is temporarily unavailable. Please try again shortly.' },
    });
  }
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
});

export default app;
