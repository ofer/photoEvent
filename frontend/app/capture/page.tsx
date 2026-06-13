"use client";

import { useState, useRef, useCallback } from "react";

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
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch(`/api/photos`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Upload failed (${res.status})`);
      }
      setStatus("success");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    }
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
      // Reset input so same file can be re-selected
      e.target.value = "";
    },
    [handleUpload]
  );

  const handleRetry = () => {
    setStatus("idle");
    setError("");
    fileInputRef.current?.click();
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold mb-1">Take a Photo</h1>
        <p className="text-gray-500 mb-10 text-sm">
          Tap the button below to capture
        </p>

        {/* Camera button */}
        <div className="flex justify-center mb-10">
          <label className="cursor-pointer">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleChange}
              className="hidden"
            />
            <div
              className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-150 shadow-lg
                ${
                  status === "idle"
                    ? "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-blue-200"
                    : status === "uploading"
                    ? "bg-blue-400 cursor-not-allowed shadow-blue-100"
                    : status === "success"
                    ? "bg-green-500 shadow-green-200"
                    : "bg-red-500 shadow-red-200"
                }`}
            >
              {status === "uploading" ? (
                <svg
                  className="w-10 h-10 text-white animate-spin"
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
              ) : (
                <svg
                  className="w-10 h-10 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <circle
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    cx="12"
                    cy="13"
                    r="3"
                  />
                </svg>
              )}
            </div>
          </label>
        </div>

        {/* Status messages */}
        {status === "uploading" && (
          <div className="fade-in">
            <p className="text-blue-600 font-medium text-sm">Uploading…</p>
            {fileName && (
              <p className="text-xs text-gray-400 mt-1 truncate">{fileName}</p>
            )}
          </div>
        )}

        {status === "success" && (
          <div className="fade-in">
            <div className="inline-flex items-center gap-2 text-green-600 font-medium">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p>Photo uploaded!</p>
            </div>
            <p className="text-gray-400 text-xs mt-1">
              Tap the button to take another
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="fade-in">
            <div className="inline-flex items-center gap-2 text-red-600 font-medium mb-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm">{error}</p>
            </div>
            <button
              onClick={handleRetry}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
