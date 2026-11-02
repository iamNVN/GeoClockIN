import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { describe, it } from 'node:test';
import seed from '../config/geoclockin.config.js';
import { keyIdFor, publicKeyFrom, QR_MAX_AGE_SECONDS, qrSignedText, setupSignedText, verifyQrToken, verifySetupCode } from '../src/lib/qrToken.js';
import { normalizeSettings } from '../src/lib/settingsSchema.js';
import { normalizePairingCode } from '../src/displays.js';
import { issuePresence, readPresence } from '../src/presence.js';

const signWith = (privateKey, text) => sign('sha256', Buffer.from(text), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');

/** A display key pair and code signers: `code` as displays make them now, `legacyCode` as /display used to. */
function makeDisplay(name = 'Reception') {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const raw = publicKey.export({ type: 'spki', format: 'der' }).toString('base64url');
  const display = { id: keyIdFor(raw), name, publicKey: raw };
  const fields = (seconds, changes = {}) => ({ v: 2, d: display.id, n: randomBytes(9).toString('base64url'), iat: seconds, exp: seconds + 5, p: 'att', ...changes });
  const code = (seconds, changes) => {
    const signed = fields(seconds, changes);
    return JSON.stringify({ ...signed, sig: signWith(privateKey, qrSignedText(signed)) });
  };
  const legacyCode = (seconds) => {
    const message = `GCQ1.${display.id}.${seconds}`;
    return `${message}.${signWith(privateKey, message)}`;
  };
  const setupCode = () => JSON.stringify({ v: 2, p: 'setup', pk: raw, sig: signWith(privateKey, setupSignedText(raw)) });
  return { display, code, legacyCode, setupCode };
}

const NOW = Date.UTC(2026, 9, 31, 4, 0, 0);
const nowSeconds = NOW / 1000;

describe('verifyQrToken', () => {
  const reception = makeDisplay();
  const other = makeDisplay('Other office');
  const check = (code) => verifyQrToken(code, [reception.display], NOW);

  it('accepts a fresh code from a registered display', () => {
    const code = reception.code(nowSeconds - 2);
    const result = check(code);
    assert.equal(result.ok, true);
    assert.equal(result.display.name, 'Reception');
    assert.equal(result.nonce, JSON.parse(code).n);
  });

  it('fits a version 9 QR code at medium error correction (180 bytes)', () => {
    assert.equal(Buffer.byteLength(reception.code(nowSeconds)), 180);
  });

  it('rejects codes older than the limit, as a photo would be', () => {
    const old = check(reception.code(nowSeconds - QR_MAX_AGE_SECONDS - 1));
    assert.equal(old.code, 'EXPIRED');
    assert.equal(old.display.id, reception.display.id);
    assert.equal(old.ageSeconds, QR_MAX_AGE_SECONDS + 1);
    assert.equal(check(reception.code(nowSeconds - 3600)).code, 'EXPIRED');
  });

  it('rejects codes from a display clock running ahead', () => {
    assert.equal(check(reception.code(nowSeconds + 60)).code, 'AHEAD');
    assert.equal(check(reception.code(nowSeconds + 2)).ok, true);
  });

  it('rejects unregistered displays and forged or altered codes', () => {
    assert.equal(check(other.code(nowSeconds)).code, 'UNKNOWN_DISPLAY');
    // Signed by another key but claiming the registered display's id.
    assert.equal(check(other.code(nowSeconds, { d: reception.display.id })).code, 'INVALID');
    // A valid code with one field changed afterwards.
    for (const change of [{ iat: nowSeconds }, { exp: nowSeconds + 3 }, { n: 'AAAAAAAAAAAA' }]) {
      const altered = { ...JSON.parse(reception.code(nowSeconds - 600)), ...change };
      assert.equal(check(JSON.stringify(altered)).code, 'INVALID', Object.keys(change)[0]);
    }
  });

  it('does not care about JSON spacing or key order', () => {
    const { sig, ...rest } = JSON.parse(reception.code(nowSeconds));
    const reordered = JSON.stringify({ sig, ...rest }, null, 1);
    assert.equal(check(reordered).ok, true);
  });

  it('rejects signed codes that claim a longer life than the limit', () => {
    assert.equal(check(reception.code(nowSeconds, { exp: nowSeconds + QR_MAX_AGE_SECONDS + 1 })).code, 'INVALID');
    assert.equal(check(reception.code(nowSeconds, { exp: nowSeconds })).code, 'INVALID');
  });

  it('rejects malformed codes without trusting any field', () => {
    const good = JSON.parse(reception.code(nowSeconds));
    const cases = [
      { ...good, extra: 1 },
      { ...good, p: 'other' },
      { ...good, d: 123 },
      { ...good, n: 'short' },
      { ...good, iat: String(good.iat) },
      { ...good, exp: 1.5 },
      { ...good, sig: 'AAAA' },
      { ...good, sig: null },
    ];
    for (const code of cases) assert.equal(check(JSON.stringify(code)).code, 'INVALID', JSON.stringify(code).slice(0, 80));
    const { sig, ...unsigned } = good;
    assert.equal(check(JSON.stringify(unsigned)).code, 'INVALID');
  });

  it('tells a display still in setup apart from other codes', () => {
    assert.equal(check(reception.setupCode()).code, 'SETUP_CODE');
  });

  it('ignores codes that are not office codes', () => {
    for (const code of ['https://example.com', null, 42, '{"a":1}', '[]', '{"v":1}', '{broken', `{"v":2,"x":"${'y'.repeat(500)}"}`]) {
      assert.equal(check(code).code, 'NOT_OFFICE_QR', String(code).slice(0, 30));
    }
  });

  it('still accepts the earlier format from display pages opened before the change', () => {
    const fresh = check(reception.legacyCode(nowSeconds - 2));
    assert.equal(fresh.ok, true);
    assert.equal(fresh.nonce, null);
    assert.equal(check(reception.legacyCode(nowSeconds - QR_MAX_AGE_SECONDS - 1)).code, 'EXPIRED');
    assert.equal(check(reception.legacyCode(nowSeconds + 60)).code, 'AHEAD');
    assert.equal(check(other.legacyCode(nowSeconds)).code, 'UNKNOWN_DISPLAY');
    const moved = reception.legacyCode(nowSeconds - 600).split('.');
    moved[2] = String(nowSeconds);
    assert.equal(check(moved.join('.')).code, 'INVALID');
    assert.equal(check('GCQ1.only-two').code, 'NOT_OFFICE_QR');
  });
});

describe('verifySetupCode', () => {
  const device = makeDisplay('ESP32');
  const other = makeDisplay('Other');

  it('accepts a setup code signed by the key it carries', () => {
    const result = verifySetupCode(device.setupCode());
    assert.deepEqual(result, { ok: true, publicKey: device.display.publicKey });
  });

  it('rejects a setup code signed by another key', () => {
    const forged = { ...JSON.parse(other.setupCode()), pk: device.display.publicKey };
    assert.equal(verifySetupCode(JSON.stringify(forged)).code, 'INVALID');
  });

  it('rejects keys that are not P-256 and altered codes', () => {
    const good = JSON.parse(device.setupCode());
    assert.equal(verifySetupCode(JSON.stringify({ ...good, pk: 'not-a-key' })).code, 'INVALID');
    assert.equal(verifySetupCode(JSON.stringify({ ...good, sig: 'A'.repeat(86) })).code, 'INVALID');
    assert.equal(verifySetupCode(JSON.stringify({ ...good, sig: 7 })).code, 'INVALID');
  });

  it('explains a live code, and refuses anything else', () => {
    assert.equal(verifySetupCode(device.code(nowSeconds)).code, 'LIVE_CODE');
    for (const code of ['hello', null, '{"v":2,"p":"setup"}', '{"v":2,"p":"other"}', device.legacyCode(nowSeconds)]) {
      assert.equal(verifySetupCode(code).code, 'NOT_SETUP_CODE', String(code).slice(0, 30));
    }
  });
});

describe('codes made by the ESP32 firmware', () => {
  // Real output of firmware/esp32-display, read off its screen on a simulated ESP32.
  const setupCode =
    '{"v":2,"p":"setup","pk":"MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEIAtrb_69WKYSEgEbKDmIsXzJhTohq7xqzz_6r2BcmuoA-lQbA5GNt8QOpiWVJeWXdk7n-sr_8qbVy0TvAEX9ZQ","sig":"X0RQoBUhF3xYgq73t01HmlrgVrnLEnAsVoyvgMNczvR-xQ2yxtGswXLIOjPuQbY1awbZen6mRSOaGLIkMcYNnw"}';
  const liveCode =
    '{"v":2,"d":"NTla3pAo","n":"Pqb8_P7fqbLn","iat":1793618969,"exp":1793618974,"p":"att","sig":"gzyGboK_GZYUznLXQ0PP9JvdCmZEBUin2xSz-eYdB7TfULE-QzQpUpI0p-fPL7Ev7PYONq98bqth16UG8GPBbQ"}';
  const iat = 1793618969;

  it('accepts its setup code, and derives the id its codes carry', () => {
    const setup = verifySetupCode(setupCode);
    assert.equal(setup.ok, true);
    assert.equal(keyIdFor(setup.publicKey), 'NTla3pAo');
  });

  it('accepts its live code while it is in date, and not after', () => {
    const { publicKey } = verifySetupCode(setupCode);
    const display = { id: keyIdFor(publicKey), name: 'ESP32', publicKey };
    assert.equal(verifyQrToken(liveCode, [display], iat * 1000 + 1000).ok, true);
    assert.equal(verifyQrToken(liveCode, [display], (iat + 6) * 1000).code, 'EXPIRED');
    assert.equal(verifyQrToken(liveCode.replace('Pqb8', 'Pqb9'), [display], iat * 1000).code, 'INVALID');
  });
});

describe('publicKeyFrom', () => {
  const reception = makeDisplay();

  it('only takes P-256 public keys', () => {
    assert.ok(publicKeyFrom(reception.display.publicKey));
    assert.equal(publicKeyFrom('not-a-key'), null);
    const ed25519 = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'der' }).toString('base64url');
    assert.equal(publicKeyFrom(ed25519), null);
    const p384 = generateKeyPairSync('ec', { namedCurve: 'P-384' }).publicKey.export({ type: 'spki', format: 'der' }).toString('base64url');
    assert.equal(publicKeyFrom(p384), null);
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

describe('display pairing codes', () => {
  it('are read without case, spaces or dashes', () => {
    assert.equal(normalizePairingCode(' k7qm-9xp2 '), 'K7QM9XP2');
    assert.equal(normalizePairingCode(null), '');
  });
});
