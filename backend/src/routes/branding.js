import { Router } from 'express';
import { readLogo } from '../branding.js';

const router = Router();

// The company logo, public so both apps can show it before sign-in. Without an
// uploaded logo, redirects to the default one.
router.get('/logo', async (req, res) => {
  const logo = await readLogo();
  if (!logo) {
    res.set('Cache-Control', 'public, max-age=300');
    return res.redirect(302, '/brand/logo.webp');
  }
  const etag = `"${logo.updatedAt.getTime()}"`;
  res.set({
    'Content-Type': logo.contentType,
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
    ETag: etag,
    // Uploaded SVGs must never run scripts, even if opened directly.
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  });
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  res.send(logo.data);
});

export default router;
