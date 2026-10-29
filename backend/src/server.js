// Local development server. On Vercel the app is served by api/index.js instead.
import app from './app.js';

const port = Number(process.env.PORT) || 3001;

app.listen(port, () => {
  console.log(`GeoClockIN API listening on http://localhost:${port}`);
  if (!process.env.DATABASE_URL) console.warn('DATABASE_URL is not set — attendance endpoints will return 503.');
});
