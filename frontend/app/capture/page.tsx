"use client";

import { useState, useRef, useCallback } from "react";
import { uploadPhoto } from "@/lib/api";

type Status = "idle" | "uploading" | "success" | "error";

export default function CapturePage() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (file: File) => {
    setFileName(file.name);
    setStatus("uploading");
    setError("");
    try {
      await uploadPhoto(file);
      setStatus("success");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setError("Upload failed. Please try again.");
    }
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <h1 className="text-3xl font-bold mb-2">Take a Photo</h1>
        <p className="text-gray-500 mb-8">
          Tap the button below to capture a photo
        </p>

        <div className="flex justify-center mb-8">
          <label className="cursor-pointer">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleChange}
              className="hidden"
            />
            <div className="w-32 h-32 rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 flex items-center justify-center transition-colors shadow-lg">
              <svg
                className="w-12 h-12 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
          </label>
        </div>

        {status === "uploading" && (
          <div className="text-blue-600 font-medium">
            <p>Uploading...</p>
            {fileName && (
              <p className="text-sm text-gray-500 mt-1 truncate">{fileName}</p>
            )}
          </div>
        )}

        {status === "success" && (
          <div className="text-green-600 font-medium">
            <svg
              className="w-16 h-16 mx-auto mb-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <p>Photo uploaded!</p>
          </div>
        )}

        {status === "error" && (
          <div className="text-red-600 font-medium">
            <svg
              className="w-16 h-16 mx-auto mb-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            <p>{error}</p>
          </div>
        )}
      </div>
    </main>
  );
}
