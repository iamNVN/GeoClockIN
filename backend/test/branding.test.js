import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectImageType } from '../src/branding.js';

describe('detectImageType', () => {
  it('recognises PNG, JPEG, WebP and SVG by content', () => {
    assert.equal(detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])), 'image/png');
    assert.equal(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), 'image/jpeg');
    assert.equal(detectImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'ascii')), 'image/webp');
    assert.equal(detectImageType(Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>')), 'image/svg+xml');
    assert.equal(detectImageType(Buffer.from('﻿  <svg viewBox="0 0 1 1"/>')), 'image/svg+xml');
  });

  it('rejects anything else, whatever the file is called', () => {
    assert.equal(detectImageType(Buffer.from('GIF89a')), null);
    assert.equal(detectImageType(Buffer.from('<html><body>not an image</body></html>')), null);
    assert.equal(detectImageType(Buffer.from('%PDF-1.7')), null);
  });
});
