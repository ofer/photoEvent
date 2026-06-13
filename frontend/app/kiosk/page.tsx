"use client";

import { useState, useEffect, useRef, useCallback } from "react";
interface Photo {
  id: string;
  name: string;
  timestamp: string;
  url: string;
  thumb: string;
}

const COUNTDOWN_SECONDS = 30;

export default function KioskPage() {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [countdown, setCountdown] = useState<number>(COUNTDOWN_SECONDS);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");
  const [photoKey, setPhotoKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<number>(COUNTDOWN_SECONDS);
  const sourceRef = useRef<EventSource | null>(null);
  const startCountdownRef = useRef<((p: Photo) => void)>(null);

  const startCountdown = useCallback((p: Photo) => {
    setPhotoKey((k) => k + 1);
    setPhoto(p);
    setPrinting(true);
    countdownRef.current = COUNTDOWN_SECONDS;
    setCountdown(countdownRef.current);
    setError("");

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);
      if (countdownRef.current <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }, 1000);
  }, []);

  // Keep a mutable ref to startCountdown so SSE handler doesn't need it in deps
  startCountdownRef.current = startCountdown;

  // SSE connection — relative path, proxied by Next.js middleware to backend
  useEffect(() => {
    const sseUrl = `/api/updates`;

    const evtSource = new EventSource(sseUrl);

    evtSource.onopen = () => setError("");
    evtSource.onmessage = (event) => {
      try {
        const photo = JSON.parse(event.data);
        startCountdownRef.current?.(photo);
      } catch {
        // ignore parse errors
      }
    };

    evtSource.onerror = () => {
      evtSource.close();
      setError("Connection lost. Reconnecting...");
    };

    sourceRef.current = evtSource;

    return () => {
      evtSource.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Auto-print when countdown hits 0
  useEffect(() => {
    if (countdown === 0 && photo && printing) {
      setTimeout(() => {
        window.print();
        setTimeout(() => {
          setPhoto(null);
          setPrinting(false);
        }, 500);
      }, 300);
    }
  }, [countdown, photo, printing]);

  // Color coding for countdown
  const timerColor =
    countdown > 15
      ? "text-white"
      : countdown > 5
      ? "text-yellow-300"
      : "text-red-400";

  const progressPct = (countdown / COUNTDOWN_SECONDS) * 100;

  return (
    <main className="min-h-screen bg-black flex items-center justify-center relative select-none overflow-hidden">
      {!photo || !printing ? (
        <div className="text-center fade-in">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
          <p className="text-white/50 text-sm font-medium">Waiting for photos…</p>
        </div>
      ) : (
        <div key={photoKey} className="kiosk-print-area w-full h-full flex flex-col items-center justify-center">
          {/* Photo with fade transition */}
          <div className="relative flex items-center justify-center w-full h-full">
            <img
              src={`/api/frame/${photo.id}`}
              alt="Captured photo"
              className="max-w-[90vw] max-h-[78vh] object-contain photo-enter"
            />
          </div>

          {/* Countdown + Discard */}
          <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center pb-8 pt-24 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
            {/* Timer ring */}
            <div className="flex items-center gap-5 mb-3">
              <div className="relative w-14 h-14">
                <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke="rgba(255,255,255,0.15)"
                    strokeWidth="2.5"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke={countdown > 15 ? "#fff" : countdown > 5 ? "#fbbf24" : "#ef4444"}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={`${progressPct} 100`}
                    className="transition-all duration-1000 ease-linear"
                  />
                </svg>
                <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${timerColor}`}>
                  {Math.ceil(countdown)}
                </span>
              </div>

              <span className="text-white/40 text-xs font-medium">
                {countdown > 0 ? "auto-printing" : "printing…"}
              </span>
            </div>

            {/* Discard button */}
            <button
              onClick={() => {
                if (timerRef.current) clearInterval(timerRef.current);
                timerRef.current = null;
                countdownRef.current = COUNTDOWN_SECONDS;
                setPhoto(null);
                setPrinting(false);
                setCountdown(COUNTDOWN_SECONDS);
              }}
              className="px-6 py-2.5 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white/80 hover:text-white rounded-lg text-sm font-medium transition-colors backdrop-blur-sm"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/10 text-white/70 px-4 py-2 rounded-lg text-xs backdrop-blur-sm">
          {error}
        </div>
      )}

      {/* Print CSS */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .kiosk-print-area,
          .kiosk-print-area * {
            visibility: visible;
          }
          .kiosk-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
          }
          .kiosk-print-area > div:last-child {
            display: none !important;
          }
        }
      `}</style>
    </main>
  );
}
