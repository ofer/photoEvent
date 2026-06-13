"use client";

import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "@/lib/api";

interface EventConfig {
  name: string;
  year: string;
}

export default function Home() {
  const [event, setEvent] = useState<EventConfig>({
    name: process.env.NEXT_PUBLIC_EVENT_NAME || "PhotoEvent",
    year: process.env.NEXT_PUBLIC_EVENT_YEAR || "2026",
  });

  const fetchEvent = useCallback(() => {
    fetch(`${API_BASE}/api/event`)
      .then((r) => r.ok && r.json())
      .then((data) => {
        if (data?.name || data?.year) setEvent(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchEvent();
  }, [fetchEvent]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="text-center px-6 max-w-lg">
        {/* Event title */}
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-gray-900 mb-2">
          {event.name}
        </h1>
        <p className="text-xl text-gray-500 font-medium mb-2">{event.year}</p>
        <p className="text-gray-400 mb-10">
          Capture, share, and print photos at your event
        </p>

       {/* Navigation grid */}
        <div className="grid grid-cols-2 gap-3 w-72 sm:w-80 mx-auto">
          <a
            href="/capture"
            className="flex flex-col items-center gap-2 px-5 py-5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-200 active:bg-blue-800 transition-all duration-150 font-medium"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2 2V9z" />
              <circle strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} cx="12" cy="13" r="3" />
            </svg>
            <span>Take a Photo</span>
          </a>

          <a
            href="/gallery"
            className="flex flex-col items-center gap-2 px-5 py-5 bg-white text-gray-700 rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-lg hover:shadow-gray-100 active:bg-gray-50 transition-all duration-150 font-medium"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>Gallery</span>
          </a>

          <a
            href="/qr"
            className="flex flex-col items-center gap-2 px-5 py-5 bg-white text-gray-700 rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-lg hover:shadow-gray-100 active:bg-gray-50 transition-all duration-150 font-medium"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h2m-2 0h-2M20 8v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h8" />
            </svg>
            <span>QR Code</span>
          </a>

          <a
            href="/kiosk"
            className="flex flex-col items-center gap-2 px-5 py-5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 hover:shadow-lg hover:shadow-gray-300 active:bg-gray-950 transition-all duration-150 font-medium"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span>Kiosk Mode</span>
          </a>

          <a
            href="/config"
            className="flex flex-col items-center gap-2 px-5 py-5 col-span-2 bg-white text-gray-700 rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-lg hover:shadow-gray-100 active:bg-gray-50 transition-all duration-150 font-medium"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Configuration</span>
          </a>
        </div>
      </div>
    </main>
  );
}
