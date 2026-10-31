import { Camera, LoaderCircle, RefreshCw } from 'lucide-react';
import QrScanner from 'qr-scanner';
import { useEffect, useRef, useState } from 'react';

const OFFICE_CODE_PREFIX = 'GCQ1.';

/** A user-facing explanation of why the camera didn't start. */
function cameraProblem(error) {
  const name = error?.name ?? '';
  const text = String(error?.message ?? error ?? '');
  if (!window.isSecureContext) return 'The camera needs a secure (https) connection.';
  if (name === 'NotAllowedError' || /permission|denied/i.test(text)) {
    return 'Allow camera access for this site in your browser settings, then try again.';
  }
  if (name === 'NotFoundError' || /not found/i.test(text)) return 'No camera was found on this device.';
  if (name === 'NotReadableError') return 'The camera is being used by another app. Close it and try again.';
  return 'Couldn’t start the camera. Try again.';
}

/**
 * Live camera view that decodes continuously, frame by frame. Every new office
 * code it sees goes to `onCode` straight away; a code is never sent twice (the
 * office display shows a new one every second), and while `busy` (the server
 * is checking one) codes are skipped. `message` shows under the view.
 */
export function OfficeQrScanner({ onCode, busy, message }) {
  const viewRef = useRef(null);
  const [camera, setCamera] = useState({ status: 'starting' });
  const [attempt, setAttempt] = useState(0);
  const [hint, setHint] = useState(null);
  const latest = useRef({ onCode, busy, lastCode: '' });
  latest.current.onCode = onCode;
  latest.current.busy = busy;

  useEffect(() => {
    let active = true;
    // A video element per scanner: a stopped scanner releases its element's
    // stream a moment later, which must not hit the next scanner's stream.
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    viewRef.current.prepend(video);
    const scanner = new QrScanner(
      video,
      ({ data }) => {
        const state = latest.current;
        if (!active || state.busy || data === state.lastCode) return;
        state.lastCode = data;
        if (!data.startsWith(OFFICE_CODE_PREFIX)) {
          setHint('That isn’t the office code. Point at the code on the office display.');
          return;
        }
        setHint(null);
        state.onCode(data);
      },
      { returnDetailedScanResult: true, preferredCamera: 'environment', maxScansPerSecond: 20, onDecodeError: () => {} },
    );
    setCamera({ status: 'starting' });
    scanner.start().then(
      () => active && setCamera({ status: 'scanning' }),
      (error) => {
        if (!active) return;
        console.warn('Camera failed to start:', error);
        setCamera({ status: 'failed', problem: cameraProblem(error) });
      },
    );
    return () => {
      active = false;
      scanner.destroy();
      video.remove();
    };
  }, [attempt]);

  return (
    <section className="qr-scan card pop-in" aria-label="Office QR scanner">
      <div ref={viewRef} className={`qr-scan__view is-${camera.status}`}>
        <span className="qr-scan__frame" aria-hidden="true" />
        {camera.status === 'scanning' && !busy && <span className="qr-scan__line" aria-hidden="true" />}
        {camera.status === 'starting' && (
          <span className="qr-scan__overlay">
            <Camera aria-hidden="true" /> Starting camera…
          </span>
        )}
        {busy && (
          <span className="qr-scan__overlay qr-scan__overlay--busy">
            <LoaderCircle className="spin" aria-hidden="true" /> Verifying code…
          </span>
        )}
        {camera.status === 'failed' && (
          <span className="qr-scan__overlay qr-scan__overlay--failed" role="alert">
            <Camera aria-hidden="true" />
            {camera.problem}
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setAttempt((n) => n + 1)}>
              <RefreshCw aria-hidden="true" /> Try again
            </button>
          </span>
        )}
      </div>
      <p className={`qr-scan__hint${message || hint ? ' is-warning' : ''}`} aria-live="polite">
        {message || hint || 'Point your camera at the QR code on the office display.'}
      </p>
    </section>
  );
}
