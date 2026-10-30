// Company logo uploaded from the admin dashboard.
import { query } from './db.js';
import { HttpError } from './errors.js';

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** PNG, JPEG, WebP or SVG, recognised from the file's contents (not its name). */
export function detectImageType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG)) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  const head = buffer.subarray(0, 2048).toString('utf8').replace(/^﻿/, '').trimStart().toLowerCase();
  if (/^(<\?xml|<svg|<!--|<!doctype svg)/.test(head) && head.includes('<svg')) return 'image/svg+xml';
  return null;
}

// Serverless instances cache the logo's version briefly (see settings.js).
const CACHE_MS = 10_000;
let cachedVersion;
let cachedAt = 0;

/** Timestamp of the uploaded logo (for cache-busting URLs), or null when using the default. */
export async function logoVersion() {
  if (cachedVersion !== undefined && Date.now() - cachedAt < CACHE_MS) return cachedVersion;
  const { rows } = await query(`SELECT updated_at FROM branding_assets WHERE name = 'logo'`);
  cachedVersion = rows[0] ? rows[0].updated_at.getTime() : null;
  cachedAt = Date.now();
  return cachedVersion;
}

export async function readLogo() {
  const { rows } = await query(`SELECT content_type, data, updated_at FROM branding_assets WHERE name = 'logo'`);
  return rows[0] ? { contentType: rows[0].content_type, data: rows[0].data, updatedAt: rows[0].updated_at } : null;
}

export async function saveLogo(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new HttpError(400, 'INVALID_FILE', 'Choose an image to upload.');
  if (buffer.length > MAX_LOGO_BYTES) throw new HttpError(400, 'FILE_TOO_LARGE', 'The logo must be 2 MB or smaller.');
  const contentType = detectImageType(buffer);
  if (!contentType) throw new HttpError(400, 'INVALID_FILE', 'Upload a PNG, JPG, WebP or SVG image.');
  const { rows } = await query(
    `INSERT INTO branding_assets (name, content_type, data, updated_at) VALUES ('logo', $1, $2, now())
     ON CONFLICT (name) DO UPDATE SET content_type = EXCLUDED.content_type, data = EXCLUDED.data, updated_at = now()
     RETURNING updated_at`,
    [contentType, buffer],
  );
  cachedVersion = rows[0].updated_at.getTime();
  cachedAt = Date.now();
  return cachedVersion;
}

export async function deleteLogo() {
  await query(`DELETE FROM branding_assets WHERE name = 'logo'`);
  cachedVersion = null;
  cachedAt = Date.now();
}
