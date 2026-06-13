"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { API_BASE } from "@/lib/api";

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
  const [isPrinting, setIsPrinting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<number>(COUNTDOWN_SECONDS);
  const sourceRef = useRef<EventSource | null>(null);
  const startCountdownRef = useRef<((p: Photo) => void)>(null);

  const startCountdown = useCallback((p: Photo) => {
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

  // SSE connection - connect directly to backend to avoid Next.js middleware buffering
  useEffect(() => {
    // Use the backend URL directly for SSE to avoid middleware issues
    const backendUrl = window.location.hostname === "localhost"
      ? `${window.location.protocol}//${window.location.hostname}:4000`
      : `${API_BASE || ""}`;
    const sseUrl = `${backendUrl}/api/updates`;
    console.log("[KIOSK] SSE connecting to:", sseUrl);
    const evtSource = new EventSource(sseUrl);

    evtSource.onopen = () => console.log("[KIOSK] SSE connected");
    evtSource.onmessage = (event) => {
      console.log("[KIOSK] SSE message:", event.data);
      try {
        const photo = JSON.parse(event.data);
        console.log("[KIOSK] Received photo:", photo.id);
        startCountdownRef.current?.(photo);
      } catch (e) {
        console.warn("[KIOSK] Failed to parse SSE data:", e);
      }
    };

    evtSource.onerror = (err) => {
      console.error("[KIOSK] SSE error", err);
      evtSource.close();
      setError("Connection lost. Reconnecting...");
    };

    sourceRef.current = evtSource;

    return () => {
      console.log("[KIOSK] cleanup: closing SSE");
      evtSource.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Auto-print when countdown hits 0
  useEffect(() => {
    if (countdown === 0 && photo && printing) {
      setIsPrinting(true);
      // Small delay to ensure UI is rendered before print
      setTimeout(() => {
        window.print();
        // After print dialog closes, reset
        setTimeout(() => {
          setPhoto(null);
          setPrinting(false);
          setIsPrinting(false);
        }, 500);
      }, 300);
    }
  }, [countdown, photo, printing]);

  const handleDiscard = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    countdownRef.current = COUNTDOWN_SECONDS;
    setPhoto(null);
    setPrinting(false);
    setCountdown(COUNTDOWN_SECONDS);
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <main className="min-h-screen bg-black flex items-center justify-center relative select-none">
      {!photo || !printing ? (
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full border-4 border-white/20 border-t-white animate-spin" />
          <p className="text-white/60 text-lg">Waiting for photos...</p>
        </div>
      ) : (
        <div className={`kiosk-print-area flex flex-col items-center justify-center w-full h-full ${printing ? "printing" : ""}`}>
          {/* Photo */}
          <div className="relative max-w-[90vw] max-h-[75vh] flex items-center justify-center">
            <img
              src={`${API_BASE}/api/frame/${photo.id}`}
              alt="Captured photo"
              className="max-w-full max-h-[75vh] object-contain rounded shadow-2xl"
            />
          </div>

          {/* Countdown + Discard */}
          <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-3">
            <div className="flex items-center gap-4">
              {/* Timer ring */}
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="2"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeDasharray={`${(countdown / COUNTDOWN_SECONDS) * 100} 100`}
                    strokeLinecap="round"
                    className="transition-all duration-1000"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-white text-sm font-bold">
                  {formatTime(countdown)}
                </span>
              </div>
            </div>

            {/* Discard button */}
            <button
              onClick={handleDiscard}
              className="px-8 py-3 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-lg font-bold text-lg transition-colors shadow-lg"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 text-white/80 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Print-specific CSS: hide everything except kiosk content */}
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
