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
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
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
  }, [photos]);

  useEffect(() => {
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && selectedIdx !== null) setSelectedIdx(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedIdx]);

  useEffect(() => {
    if (selectedIdx !== null) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedIdx]);

  const openViewer = (index: number) => setSelectedIdx(index);
  const closeViewer = () => setSelectedIdx(null);

  const goTo = (delta: number) => {
    if (selectedIdx === null) return;
    const next = selectedIdx + delta;
    if (next >= 0 && next < photos.length) {
      setSelectedIdx(next);
    }
  };

  const selectedPhoto = selectedIdx !== null ? photos[selectedIdx] : null;

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
              <button
                key={photo.id}
                type="button"
                onClick={() => openViewer(index)}
                className={`group block aspect-square rounded-lg overflow-hidden bg-gray-100 shadow-sm hover:shadow-md transition-all duration-200 text-left ${
                  index === 0 && photos.length > prevPhotosRef.current.length
                    ? "photo-enter"
                    : ""
                }`}
                aria-label={`View ${photo.name}`}
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
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedPhoto && (
        <div
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeViewer();
          }}
        >
          <button
            type="button"
            onClick={closeViewer}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Close viewer"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="absolute top-4 left-4 z-10 text-white/80 text-sm font-medium">
            {selectedIdx !== null ? selectedIdx + 1 : 0} / {photos.length}
          </div>

          <button
            type="button"
            onClick={() => goTo(-1)}
            disabled={selectedIdx === 0}
            className="absolute left-4 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 disabled:cursor-default transition-colors"
            aria-label="Previous photo"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => goTo(1)}
            disabled={selectedIdx === photos.length - 1}
            className="absolute right-4 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 disabled:cursor-default transition-colors"
            aria-label="Next photo"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <img
            src={selectedPhoto.url}
            alt={selectedPhoto.name}
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
          />
        </div>
      )}
    </main>
  );
}
