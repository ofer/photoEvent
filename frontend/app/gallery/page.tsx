"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getPhotos, API_BASE } from "@/lib/api";

interface Photo {
  id: string;
  name: string;
  timestamp: string;
  url: string;
  thumb: string;
}

export default function GalleryPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [event, setEvent] = useState<{ name: string; year: string }>({
    name: "",
    year: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const prevPhotosRef = useRef<string[]>([]);

  const fetchPhotos = useCallback(async () => {
    try {
      setError("");
      const data = await getPhotos();
      setPhotos(data);
    } catch (err) {
      setError("Failed to load photos. Please refresh.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPhotos();

    // Fetch event config
    fetch(`${API_BASE}/api/event`)
      .then((r) => r.json())
      .then((data) => setEvent(data ?? {}))
      .catch(() => {});

    // SSE for live updates
    const evtSource = new EventSource(`${API_BASE}/api/updates`);

    evtSource.onmessage = (event) => {
      try {
        const photo = JSON.parse(event.data);
        setPhotos((prev) => {
          if (prev.some((p) => p.id === photo.id)) return prev;
          return [photo, ...prev];
        });
      } catch {
        // ignore parse errors
      }
    };

    evtSource.onerror = () => {
      evtSource.close();
    };

    return () => {
      evtSource.close();
    };
  }, [fetchPhotos]);

  const formatDate = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Track which photos are new for animation
  useEffect(() => {
    const prevIds = new Set(prevPhotosRef.current);
    const newPhotos = photos.filter((p) => !prevIds.has(p.id));
    prevPhotosRef.current = photos.map((p) => p.id);

    // Store new photo IDs for animation (simple approach: use a ref)
    if (newPhotos.length > 0) {
      // We use a CSS class based on photo index for first render
      // This is handled via a key + simple animation
    }
  }, [photos]);

  return (
    <main className="min-h-screen bg-white">
      <header className="sticky top-0 bg-white/90 backdrop-blur-sm border-b border-gray-100 px-4 sm:px-6 py-3 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold leading-tight">
              {event.name} {event.year}
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {photos.length} photo{photos.length !== 1 ? "s" : ""}
            </p>
          </div>
          <a
            href="/capture"
            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">Take a Photo</span>
          </a>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
            <button onClick={fetchPhotos} className="ml-auto text-red-700 underline text-xs font-medium">
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-lg overflow-hidden skeleton" />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <p className="text-gray-500 font-medium text-sm">No photos yet</p>
            <p className="text-gray-400 text-xs mt-1">
              Share the QR code to start capturing
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {photos.map((photo, index) => (
              <a
                key={photo.id}
                href={photo.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`group block aspect-square rounded-lg overflow-hidden bg-gray-100 shadow-sm hover:shadow-md transition-all duration-200 ${
                  index === 0 && photos.length > prevPhotosRef.current.length
                    ? "photo-enter"
                    : ""
                }`}
              >
                <img
                  src={photo.thumb}
                  alt={photo.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end">
                  <span className="text-white text-xs px-2.5 py-1.5 font-medium">
                    {formatDate(photo.timestamp)}
                  </span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
