import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, it } from 'node:test';
import seed from '../config/geoclockin.config.js';
import { keyIdFor, publicKeyFrom, QR_MAX_AGE_SECONDS, verifyQrToken } from '../src/lib/qrToken.js';
import { normalizeSettings } from '../src/lib/settingsSchema.js';
import { issuePresence, readPresence } from '../src/presence.js';

/** A display key pair and a code signer, as the qr-display app makes them. */
function makeDisplay(name = 'Reception') {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'jwk' }).x; // 32 bytes, base64url
  const display = { id: keyIdFor(raw), name, publicKey: raw };
  const code = (seconds) => {
    const message = `GCQ1.${display.id}.${seconds}`;
    return `${message}.${sign(null, Buffer.from(message), privateKey).toString('base64url')}`;
  };
  return { display, code };
}

const NOW = Date.UTC(2026, 9, 31, 4, 0, 0);
const nowSeconds = NOW / 1000;

describe('verifyQrToken', () => {
  const reception = makeDisplay();
  const other = makeDisplay('Other office');

  it('accepts a fresh code from a registered display', () => {
    const result = verifyQrToken(reception.code(nowSeconds - 2), [reception.display], NOW);
    assert.equal(result.ok, true);
    assert.equal(result.display.name, 'Reception');
  });

  it('rejects codes older than the limit, as a photo would be', () => {
    assert.equal(verifyQrToken(reception.code(nowSeconds - QR_MAX_AGE_SECONDS - 1), [reception.display], NOW).code, 'EXPIRED');
    assert.equal(verifyQrToken(reception.code(nowSeconds - 3600), [reception.display], NOW).code, 'EXPIRED');
  });

  it('rejects codes from a display clock running ahead', () => {
    assert.equal(verifyQrToken(reception.code(nowSeconds + 60), [reception.display], NOW).code, 'AHEAD');
  });

  it('rejects unregistered displays and forged or altered codes', () => {
    assert.equal(verifyQrToken(other.code(nowSeconds), [reception.display], NOW).code, 'UNKNOWN_DISPLAY');
    // Signed by another key but claiming the registered display's id.
    const forged = other.code(nowSeconds).replace(other.display.id, reception.display.id);
    assert.equal(verifyQrToken(forged, [reception.display], NOW).code, 'INVALID');
    // A valid code with its time changed to look fresh.
    const old = reception.code(nowSeconds - 600).split('.');
    old[2] = String(nowSeconds);
    assert.equal(verifyQrToken(old.join('.'), [reception.display], NOW).code, 'INVALID');
  });

  it('ignores codes that are not office codes', () => {
    assert.equal(verifyQrToken('https://example.com', [reception.display], NOW).code, 'NOT_OFFICE_QR');
    assert.equal(verifyQrToken(null, [reception.display], NOW).code, 'NOT_OFFICE_QR');
  });

  it('only takes 32-byte Ed25519 public keys', () => {
    assert.ok(publicKeyFrom(reception.display.publicKey));
    assert.equal(publicKeyFrom('not-a-key'), null);
    assert.equal(publicKeyFrom(Buffer.alloc(31).toString('base64url')), null);
  });
});

describe('office QR settings', () => {
  const { display } = makeDisplay();

  it('defaults to not required, derives the display id and trims keys', () => {
    assert.deepEqual(normalizeSettings(seed).qr, { required: false, displays: [] });
    const s = normalizeSettings({ ...seed, qr: { required: true, displays: [{ name: ' Reception ', publicKey: ` ${display.publicKey} ` }] } });
    assert.deepEqual(s.qr, { required: true, displays: [{ id: display.id, name: 'Reception', publicKey: display.publicKey }] });
  });

  it('needs a display before the QR code can be required', () => {
    assert.throws(() => normalizeSettings({ ...seed, qr: { required: true, displays: [] } }), { details: { field: 'qr.required' } });
  });

  it('rejects invalid and duplicate keys', () => {
    assert.throws(() => normalizeSettings({ ...seed, qr: { displays: [{ name: 'A', publicKey: 'abc' }] } }), { details: { field: 'qr.displays.0.publicKey' } });
    const twice = [
      { name: 'A', publicKey: display.publicKey },
      { name: 'B', publicKey: display.publicKey },
    ];
    assert.throws(() => normalizeSettings({ ...seed, qr: { displays: twice } }), { details: { field: 'qr.displays' } });
  });
});

describe('presence proof', () => {
  const verification = { distanceM: 12, accuracyM: 8 };
  const at = new Date('2026-10-31T03:31:05Z');

  it('carries the location check time, distance and display', () => {
    const token = issuePresence({ employeeId: 'EMP001', action: 'check_in', at, verification, qrDisplay: 'Reception' });
    const p = readPresence(token, 'EMP001', 'check_in');
    assert.equal(p.at.toISOString(), at.toISOString());
    assert.equal(p.distanceM, 12);
    assert.equal(p.qrDisplay, 'Reception');
  });

  it('only works for the same employee and action, before it expires', () => {
    const token = issuePresence({ employeeId: 'EMP001', action: 'check_in', at, verification });
    assert.throws(() => readPresence(token, 'EMP002', 'check_in'), { code: 'PRESENCE_EXPIRED' });
    assert.throws(() => readPresence(token, 'EMP001', 'check_out'), { code: 'PRESENCE_EXPIRED' });
    const expired = issuePresence({ employeeId: 'EMP001', action: 'check_in', at, verification, expiresAt: Math.floor(Date.now() / 1000) - 1 });
    assert.throws(() => readPresence(expired, 'EMP001', 'check_in'), { code: 'PRESENCE_EXPIRED' });
    assert.throws(() => readPresence(`${token.slice(0, -2)}xx`, 'EMP001', 'check_in'), { code: 'PRESENCE_EXPIRED' });
  });
});
