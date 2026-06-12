"use client";

import { useState, useEffect, useCallback } from "react";
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

  const fetchPhotos = useCallback(async () => {
    try {
      const data = await getPhotos();
      setPhotos(data);
    } catch (err) {
      console.error("Failed to fetch photos:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPhotos();

    // Fetch event config
    fetch(`${API_BASE}/api/event`)
      .then((r) => r.json())
      .then((data) => setEvent(data))
      .catch(() => {});

    // SSE for live updates
    const evtSource = new EventSource(`${API_BASE}/api/updates`);

    evtSource.onmessage = (event) => {
      try {
        const photo = JSON.parse(event.data);
        setPhotos((prev) => {
          // Add if not already present
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

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">
              {event.name} {event.year}
            </h1>
            <p className="text-sm text-gray-500">
              {photos.length} photo{photos.length !== 1 ? "s" : ""}
            </p>
          </div>
          <a
            href="/capture"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            Take a Photo
          </a>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square bg-gray-200 rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center py-20">
            <svg
              className="w-16 h-16 mx-auto text-gray-300 mb-4"
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
            <p className="text-gray-500">No photos yet</p>
            <p className="text-gray-400 text-sm mt-1">
              Share the QR code to start capturing
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {photos.map((photo) => (
              <a
                key={photo.id}
                href={photo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block aspect-square rounded-lg overflow-hidden bg-gray-200 shadow-sm hover:shadow-md transition-shadow"
              >
                <img
                  src={photo.thumb}
                  alt={photo.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {formatDate(photo.timestamp)}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
