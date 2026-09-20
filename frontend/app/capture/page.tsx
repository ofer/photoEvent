"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { uploadPhoto, transformPhoto } from "../../lib/api";
import { TrashIcon } from "@heroicons/react/24/outline";

type Phase = "idle" | "review" | "uploading" | "success" | "error";

interface AiButton {
  id: string;
  label: string;
}

const SUCCESS_DELAY_MS = 3000;

export default function CapturePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Id of the AI button whose transformed result is currently shown in the
  // preview (set by the AI button row on the review screen). null = the
  // original capture is showing.
  const [appliedButtonId, setAppliedButtonId] = useState<string | null>(null);
  // Data URL of the transformed preview (null = the original is showing).
  const [transformedUrl, setTransformedUrl] = useState<string | null>(null);
  // AI buttons from /api/config (same source as the kiosk). Empty = no row.
  const [aiButtons, setAiButtons] = useState<AiButton[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generatingButtonId, setGeneratingButtonId] = useState<string | null>(null);
  const [transformError, setTransformError] = useState("");
  const [error, setError] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped on every new capture so an in-flight transform result from a
  // previous capture (Retake/Discard) is discarded on completion.
  const captureTokenRef = useRef(0);
  const phaseRef = useRef<Phase>(phase);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Revoke the object URL when it is replaced or on unmount.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Clear the pending success timer on unmount.
  useEffect(
    () => () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    },
    []
  );

  // Fetch the AI buttons (same source the kiosk uses). Failures are silent —
  // the review screen simply shows no AI button row.
  useEffect(() => {
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        const buttons = cfg?.ai?.buttons;
        if (Array.isArray(buttons) && buttons.length > 0) {
          setAiButtons(
            buttons
              .filter(
                (b: unknown): b is AiButton =>
                  !!b &&
                  typeof (b as AiButton).id === "string" &&
                  typeof (b as AiButton).label === "string"
              )
              .map((b: AiButton) => ({ id: b.id, label: b.label }))
          );
        }
      })
      .catch(() => {});
  }, []);

  const clearCapture = useCallback(() => {
    setCapturedFile(null);
    setPreviewUrl(null); // revokes the object URL via the effect above
    setAppliedButtonId(null);
    setTransformedUrl(null);
    setGenerating(false);
    setGeneratingButtonId(null);
    setTransformError("");
    setError("");
  }, []);

  // On file select: do NOT upload. Keep the File locally and show the review.
  const handleFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset the input so the same file can be re-selected later.
      e.target.value = "";
      if (!file) return;
      // New capture: bump the token so an in-flight transform result from a
      // previous capture is discarded, and start from the original preview.
      captureTokenRef.current += 1;
      setCapturedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setAppliedButtonId(null);
      setTransformedUrl(null);
      setTransformError("");
      setError("");
      setPhase("review");
    },
    []
  );

  // Accept: upload the ORIGINAL capture. If a transformed preview is showing,
  // include the chosen button id; the kiosk re-applies it from the shared
  // server-side cache, so we never upload a transformed image.
  const handleAccept = useCallback(async () => {
    if (!capturedFile || phase === "uploading") return;
    setPhase("uploading");
    setError("");
    try {
      await uploadPhoto(capturedFile, appliedButtonId);
      clearCapture();
      setPhase("success");
      successTimerRef.current = setTimeout(() => {
        successTimerRef.current = null;
        setPhase("idle");
      }, SUCCESS_DELAY_MS);
    } catch (e) {
      setPhase("error");
      setError(
        e instanceof Error ? e.message : "Upload failed. Please try again."
      );
    }
  }, [capturedFile, appliedButtonId, phase, clearCapture]);

  // Press an AI button: POST the ORIGINAL capture + buttonId to the cached
  // transform pipeline. The original bytes are always sent, so the result is
  // cached by content and the kiosk can re-apply it later from the cache.
  const handleTransform = useCallback(
    async (buttonId: string) => {
      if (generating || phase !== "review" || !capturedFile) return;
      const token = captureTokenRef.current;
      setGenerating(true);
      setGeneratingButtonId(buttonId);
      setTransformError("");
      try {
        const data = await transformPhoto(capturedFile, buttonId);
        // Discard stale results: the capture was replaced or the review
        // screen was left while the transform was in flight.
        if (token !== captureTokenRef.current || phaseRef.current !== "review") return;
        setTransformedUrl(data.imageUrl);
        setAppliedButtonId(buttonId);
      } catch (e) {
        if (token !== captureTokenRef.current) return;
        setTransformError(
          e instanceof Error ? e.message : "Transform failed. Please try again."
        );
      } finally {
        setGenerating(false);
        setGeneratingButtonId(null);
      }
    },
    [generating, phase, capturedFile]
  );

  // Restore the original preview and drop the pending transformation choice.
  const handleShowOriginal = useCallback(() => {
    setTransformedUrl(null);
    setAppliedButtonId(null);
    setTransformError("");
  }, []);

  // Retake: clear the capture and reopen the camera immediately.
  const handleRetake = useCallback(() => {
    clearCapture();
    setPhase("idle");
    fileInputRef.current?.click();
  }, [clearCapture]);

  // Discard: clear the capture and go back to idle. Nothing hits the server.
  const handleDiscard = useCallback(() => {
    clearCapture();
    setPhase("idle");
  }, [clearCapture]);

  const inReview =
    phase === "review" || phase === "uploading" || phase === "error";

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      {/* Always mounted (hidden) so Retake can reopen the camera from review. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelected}
        className="hidden"
      />

      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold mb-1">Take a Photo</h1>
        <p className="text-gray-500 mb-10 text-sm">
          Tap the button below to capture
        </p>

        {phase === "idle" && (
          <>
            {/* Camera button */}
            <div className="flex justify-center mb-6">
              <button
                type="button"
                aria-label="Take a photo"
                onClick={() => fileInputRef.current?.click()}
                className="w-24 h-24 rounded-full flex items-center justify-center transition-all duration-150 shadow-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-blue-200 cursor-pointer"
              >
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
              </button>
            </div>
            <p className="text-xs text-gray-400">
              You will review the photo before it is sent to the kiosk
            </p>
          </>
        )}

        {phase === "success" && (
          <div className="fade-in">
            <div className="inline-flex items-center gap-2 text-green-600 font-medium">
              <svg
                className="w-5 h-5"
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
              <p>Photo sent to kiosk!</p>
            </div>
            <p className="text-gray-400 text-xs mt-1">
              Tap the button to take another
            </p>
          </div>
        )}
      </div>

      {/* Review screen: full-screen preview + action bar */}
      {inReview && previewUrl && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="relative flex-1 overflow-hidden">
            <img
              src={transformedUrl || previewUrl}
              alt="Photo preview"
              className="photo-enter h-full w-full object-cover"
            />

            {phase === "review" && transformError && (
              <div className="absolute inset-x-0 top-0 z-10 bg-black/80 px-4 py-2.5 text-center">
                <p className="text-red-400 text-sm font-medium">{transformError}</p>
              </div>
            )}

            {phase === "uploading" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
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
                <p className="text-white font-medium">Uploading…</p>
              </div>
            )}

            {phase === "error" && (
              <div className="absolute inset-x-0 bottom-0 bg-black/80 px-4 py-3 text-center">
                <p className="text-red-400 text-sm font-medium">{error}</p>
              </div>
            )}
          </div>

          {/* AI transform row (review phase only) */}
          {phase === "review" && aiButtons.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2 bg-black px-4 pt-3">
              {transformedUrl && (
                <button
                  type="button"
                  onClick={handleShowOriginal}
                  className="px-4 py-2 rounded-lg font-medium bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  Show Original
                </button>
              )}
              {aiButtons.map((btn) => {
                const isGenerating = generating && generatingButtonId === btn.id;
                return (
                  <button
                    key={btn.id}
                    type="button"
                    onClick={() => handleTransform(btn.id)}
                    disabled={generating}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      isGenerating
                        ? "bg-purple-700 text-white ring-2 ring-purple-400"
                        : "bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white disabled:opacity-50"
                    }`}
                  >
                    {isGenerating ? "Generating…" : btn.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Action bar */}
          <div className="flex items-center gap-3 p-4 bg-black">
            {phase === "review" && (
              <>
                <button
                  type="button"
                  onClick={handleRetake}
                  className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-white font-medium transition-colors"
                >
                  Retake
                </button>
                <button
                  type="button"
                  onClick={handleAccept}
                  className="flex-1 px-6 py-3 rounded-xl bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold shadow-lg shadow-green-900/40 transition-colors"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-white/80 hover:text-white font-medium transition-colors"
                >
                  <TrashIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  Discard
                </button>
              </>
            )}

            {phase === "uploading" && (
              <>
                <button
                  type="button"
                  disabled
                  className="px-5 py-3 rounded-xl bg-white/10 text-white/50 font-medium disabled:cursor-not-allowed"
                >
                  Retake
                </button>
                <button
                  type="button"
                  disabled
                  className="flex-1 px-6 py-3 rounded-xl bg-green-600/50 text-white/50 font-semibold disabled:cursor-not-allowed"
                >
                  Accept
                </button>
                <button
                  type="button"
                  disabled
                  className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/10 text-white/50 font-medium disabled:cursor-not-allowed"
                >
                  <TrashIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  Discard
                </button>
              </>
            )}

            {phase === "error" && (
              <>
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-white/80 hover:text-white font-medium transition-colors"
                >
                  <TrashIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  Discard
                </button>
                <button
                  type="button"
                  onClick={handleAccept}
                  className="flex-1 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold shadow-lg shadow-blue-900/40 transition-colors"
                >
                  Retry
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
