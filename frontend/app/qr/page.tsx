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
      const [evRes, qrRes] = await Promise.all([
        fetch(`${API_BASE}/api/event`),
        fetch(`${API_BASE}/api/qr`),
      ]);
      if (evRes.ok) {
        const ev = await evRes.json();
        setEvent(ev);
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
  }, [fetchData]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">
          {event.name} {event.year}
        </h1>
        <p className="text-gray-500 mb-8 text-lg">
          Scan to take a photo
        </p>

        <div className="flex justify-center mb-8">
          {qrUrl ? (
            <img
              src={qrUrl}
              alt="Scan to capture photos"
              className="w-80 h-80 sm:w-96 sm:h-96"
            />
          ) : (
            <div className="w-80 h-80 sm:w-96 sm:h-96 bg-gray-200 rounded-lg animate-pulse flex items-center justify-center">
              <svg
                className="w-12 h-12 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h2m-2 0h-2M20 8v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h8"
                />
              </svg>
            </div>
          )}
        </div>

        {error && (
          <p className="text-red-500 text-sm">{error}</p>
        )}

        <p className="text-gray-400 text-sm mt-6">
          Point your phone camera at the QR code
        </p>
      </div>
    </main>
  );
}
