import { Camera } from 'lucide-react';
import QrScanner from 'qr-scanner';
import { useEffect, useRef, useState } from 'react';

const CODE_PREFIX = '{"v":2,';

function cameraProblem(error) {
  if (!window.isSecureContext) return 'The camera needs a secure (https) address. Paste the setup code instead.';
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access is blocked. Allow the camera for this site, or paste the setup code instead.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found on this device. Paste the setup code instead, or open this page on a phone.';
    case 'NotReadableError':
    case 'AbortError':
      return 'The camera is being used by another app. Close it and try again, or paste the setup code instead.';
    default:
      return 'Couldn’t start the camera. Paste the setup code instead.';
  }
}

/** Live camera view that calls `onCode` with the first setup code it sees. */
export function SetupCodeScanner({ onCode }) {
  const viewRef = useRef(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const [problem, setProblem] = useState(null);
  const [hint, setHint] = useState(null);

  useEffect(() => {
    let active = true;
    let stream = null;
    // A video element per scanner: a stopped scanner releases its element's
    // stream a moment later, which must not hit the next scanner's stream.
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    viewRef.current.prepend(video);
    const scanner = new QrScanner(
      video,
      ({ data }) => {
        if (!active) return;
        if (data.startsWith(CODE_PREFIX) && data.includes('"p":"setup"')) onCodeRef.current(data);
        else if (data.startsWith(CODE_PREFIX)) setHint('That’s the display’s live code. Press its BOOT button to show the setup code.');
        else setHint('That isn’t a display’s setup code.');
      },
      { returnDetailedScanResult: true, maxScansPerSecond: 15, onDecodeError: () => {} },
    );
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then(async (opened) => {
        stream = opened;
        if (!active) return;
        // The scanner uses the stream already on the video element.
        video.srcObject = stream;
        await scanner.start();
      })
      .catch((error) => {
        if (active) setProblem(cameraProblem(error));
      })
      .finally(() => {
        if (!active) stream?.getTracks().forEach((track) => track.stop());
      });
    if (!navigator.mediaDevices) setProblem(cameraProblem(new DOMException('No camera API', 'NotSupportedError')));
    return () => {
      active = false;
      scanner.destroy();
      stream?.getTracks().forEach((track) => track.stop());
      video.remove();
    };
  }, []);

  return (
    <div className="setup-scan">
      <div ref={viewRef} className="setup-scan__view">
        {problem && (
          <span className="setup-scan__problem" role="alert">
            <Camera aria-hidden="true" />
            {problem}
          </span>
        )}
      </div>
      <p className="muted" aria-live="polite">
        {hint ?? 'Hold the display’s setup code in view. It is read automatically.'}
      </p>
    </div>
  );
}
