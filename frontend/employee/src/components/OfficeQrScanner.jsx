import { Camera, LoaderCircle, RefreshCw } from 'lucide-react';
import QrScanner from 'qr-scanner';
import { useEffect, useRef, useState } from 'react';

const OFFICE_CODE_PREFIX = 'GCQ1.';

/** A user-facing explanation of why the camera didn't start (`error` from getUserMedia). */
function cameraProblem(error) {
  if (!window.isSecureContext) return 'The camera needs a secure (https) address. Open GeoClockIN from its https link.';
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access is blocked. Allow the camera for this site (tap the icon next to the address, then Permissions), then try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found on this device.';
    case 'NotReadableError':
    case 'AbortError':
      return 'The camera is being used by another app. Close it and try again.';
    case 'NotSupportedError':
      return 'This browser can’t use the camera here. If you opened the link inside another app (WhatsApp, Instagram…), open it in Chrome or Safari.';
    default:
      return 'Couldn’t start the camera. Try again.';
  }
}

/**
 * Opens the back camera. Done here rather than by the scanner library, which
 * hides the browser's reason when the camera can't be opened.
 */
async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('No camera API', 'NotSupportedError');
  const video = { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } };
  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio: false });
  } catch (error) {
    // Only an impossible size or facing mode is worth a plain second try.
    if (error.name !== 'OverconstrainedError') throw error;
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
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
    let stream = null;
    setCamera({ status: 'starting' });
    openCamera()
      .then(async (opened) => {
        stream = opened;
        if (!active) return;
        // The scanner uses the stream already on the video element.
        video.srcObject = stream;
        await scanner.start();
        if (active) setCamera({ status: 'scanning' });
      })
      .catch((error) => {
        if (!active) return;
        console.warn('Camera failed to start:', error);
        setCamera({ status: 'failed', problem: cameraProblem(error) });
      })
      .finally(() => {
        if (!active) stream?.getTracks().forEach((track) => track.stop());
      });
    return () => {
      active = false;
      scanner.destroy();
      stream?.getTracks().forEach((track) => track.stop());
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
