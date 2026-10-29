// Vercel serverless entry point. vercel.json rewrites every /api/* request here;
// the Express app itself lives in backend/.
export { default } from '../backend/src/app.js';
