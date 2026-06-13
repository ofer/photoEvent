"use client";

import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "@/lib/api";

interface EventConfig {
  name: string;
  year: string;
}

export default function QRPage() {
  const [event, setEvent] = useState<EventConfig>({ name: "", year: "" });
  const [qrUrl, setQrUrl] = useState<string>("");
  const [error, setError] = useState<string>("");

  const fetchData = useCallback(async () => {
    try {
      setError("");
      const [evRes, qrRes] = await Promise.all([
        fetch(`${API_BASE}/api/event`),
        fetch(`${API_BASE}/api/qr`),
      ]);
      if (evRes.ok) {
        const ev = await evRes.json();
        setEvent(ev ?? {});
      }
      if (qrRes.ok) {
        const blobUrl = URL.createObjectURL(await qrRes.blob());
        setQrUrl(blobUrl);
      } else {
        setError("Failed to load QR code");
      }
    } catch {
      setError("Failed to connect to server");
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 30 seconds in case of network blips
    const interval = setInterval(fetchData, 30_000);
    return () => {
      clearInterval(interval);
      if (qrUrl) URL.revokeObjectURL(qrUrl);
    };
  }, [fetchData, qrUrl]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white p-8">
      <div className="text-center max-w-md">
        <h1 className="text-3xl font-bold mb-1">
          {event.name || "PhotoEvent"} {event.year}
        </h1>
        <p className="text-gray-500 mb-10 text-base">
          Scan to take a photo
        </p>

        <div className="flex justify-center mb-8">
          {qrUrl ? (
            <img
              src={qrUrl}
              alt="Scan to capture photos"
              className="w-72 h-72 sm:w-80 sm:h-80 rounded-lg shadow-lg"
            />
          ) : (
            <div className="w-72 h-72 sm:w-80 sm:h-80 bg-gray-100 rounded-lg flex items-center justify-center">
              <svg
                className="w-10 h-10 text-gray-300 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            </div>
          )}
        </div>

        {error && (
          <div className="inline-flex items-center gap-2 text-red-500 text-sm bg-red-50 px-4 py-2 rounded-lg">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        <p className="text-gray-400 text-xs mt-6">
          Point your phone camera at the QR code
        </p>
      </div>
    </main>
  );
}
