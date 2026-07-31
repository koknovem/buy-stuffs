import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';

function extractCode(raw: string): string | null {
  const text = raw.trim().toUpperCase();
  const fromUrl = text.match(/\/JOIN\/([A-Z0-9]{4,10})/);
  if (fromUrl) return fromUrl[1];
  const bare = text.replace(/[^A-Z0-9]/g, '');
  if (bare.length >= 4 && bare.length <= 10) return bare;
  return null;
}

export function JoinPage() {
  const { code: paramCode } = useParams();
  const navigate = useNavigate();
  const [code, setCode] = useState(paramCode?.toUpperCase() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const join = async (value: string) => {
    const normalized = extractCode(value) ?? value.trim().toUpperCase();
    if (!normalized) return;
    setBusy(true);
    setError(null);
    try {
      const { trip } = await api.joinTrip(normalized);
      navigate(`/trip/${trip.id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (paramCode) void join(paramCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramCode]);

  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    let raf = 0;

    const stop = () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    const run = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => {
          detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]>;
        } }).BarcodeDetector;

        if (!Detector || !videoRef.current) return;
        const detector = new Detector({ formats: ['qr_code'] });

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes[0]?.rawValue) {
              const found = extractCode(codes[0].rawValue);
              if (found) {
                setScanning(false);
                stop();
                await join(found);
                return;
              }
            }
          } catch {
            /* keep scanning */
          }
          raf = requestAnimationFrame(() => {
            void tick();
          });
        };
        raf = requestAnimationFrame(() => {
          void tick();
        });
      } catch {
        setError('Camera unavailable');
        setScanning(false);
      }
    };

    void run();
    return stop;
  }, [scanning]);

  return (
    <div className="app-shell">
      <div className="topbar">
        <button className="icon-btn" onClick={() => navigate(-1)}>
          ←
        </button>
        <span className="chip-code">JOIN</span>
        <span style={{ width: 52 }} />
      </div>

      <input
        className="field"
        value={code}
        placeholder="CODE"
        autoCapitalize="characters"
        onChange={(e) => setCode(e.target.value.toUpperCase())}
      />

      <div className="row">
        <button className="action-btn primary wide" disabled={busy} onClick={() => void join(code)}>
          ✅
        </button>
        <button
          className="icon-btn"
          onClick={() => setScanning((v) => !v)}
          title="scan QR"
        >
          📷
        </button>
      </div>

      {scanning && (
        <div className="scanner">
          <video ref={videoRef} muted playsInline />
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {busy && <div className="spinner" />}
    </div>
  );
}
