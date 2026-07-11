"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Photo {
  id: string;
  name: string;
  timestamp: string;
  url: string;
  thumb: string;
}

interface PrintConfig {
  paperSize: string;
  orientation: string;
  margin: string;
}

interface AiButtonConfig {
  id: string;
  label: string;
  workflowJson: string;
}

interface Config {
  print: PrintConfig;
  ai?: {
    comfyServerUrl: string;
    buttons: AiButtonConfig[];
  };
}

const COUNTDOWN_SECONDS = 30;

// Paper size metadata: CSS @page value + explicit px dimensions for print
const PAPER_SIZES: Record<string, { css: string; pxW: number; pxH: number; orientation: string }> = {
  A4:          { css: "A4",          pxW: 1239, pxH: 1754, orientation: "portrait" },
  "10x15cm":   { css: "10cm 15cm",  pxW: 378,  pxH: 567,  orientation: "landscape" },
  "5x7in":     { css: "5in 7in",    pxW: 480,  pxH: 672,  orientation: "portrait" },
  "8x10in":    { css: "8in 10in",   pxW: 768,  pxH: 960,  orientation: "portrait" },
  letter:      { css: "letter",     pxW: 1224, pxH: 1584, orientation: "portrait" },
};

// Map user-facing paper size to Chrome standard paper size name + mm dimensions
const CHROME_PAPER: Record<string, { name: string; wMm: number; hMm: number }> = {
  A4:          { name: "A4",          wMm: 210, hMm: 297 },
  "5x7in":     { name: "5x7_in",      wMm: 127, hMm: 178 },
  "8x10in":    { name: "8x10_in",     wMm: 203, hMm: 254 },
  letter:      { name: "LETTER",      wMm: 216, hMm: 279 },
};

export default function KioskPage() {
  const [photoQueue, setPhotoQueue] = useState<Photo[]>([]);
  const [countdown, setCountdown] = useState<number>(COUNTDOWN_SECONDS);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");
  const [photoKey, setPhotoKey] = useState(0);
  const [printConfig, setPrintConfig] = useState<PrintConfig>({
    paperSize: "A4",
    orientation: "landscape",
    margin: "10mm",
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<number>(COUNTDOWN_SECONDS);
  const sourceRef = useRef<EventSource | null>(null);

  const [aiConfig, setAiConfig] = useState<{ comfyServerUrl: string; buttons: AiButtonConfig[] }>({
    comfyServerUrl: "",
    buttons: [],
  });
  const [generating, setGenerating] = useState(false);
  const [generatingButtonId, setGeneratingButtonId] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [genError, setGenError] = useState("");

  const currentPhoto = photoQueue[0] || null;
  const queueLength = photoQueue.length;

  const startCountdownForNext = useCallback(() => {
    setPhotoKey((k) => k + 1);
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

  // Fetch print config
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((cfg: Config) => {
        setPrintConfig(cfg.print);
        if (cfg.ai) {
          setAiConfig({
            comfyServerUrl: cfg.ai.comfyServerUrl || "",
            buttons: cfg.ai.buttons || [],
          });
        }
      })
      .catch(() => {});
  }, []);

  // SSE connection
  useEffect(() => {
    const evtSource = new EventSource(`/api/updates`);

    evtSource.onopen = () => setError("");
    evtSource.onmessage = (event) => {
      try {
        const photo = JSON.parse(event.data);
        setPhotoQueue((prev) => {
          const updated = [...prev, photo];
          // Start countdown only when transitioning from empty to non-empty
          if (prev.length === 0) {
            startCountdownForNext();
          }
          return updated;
        });
      } catch {
        // ignore parse errors
      }
    };

    evtSource.onerror = () => {
      evtSource.close();
      setError("Connection lost. Reconnecting...");
    };

    sourceRef.current = evtSource;

    return () => {
      evtSource.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startCountdownForNext]);

  // Auto-print when countdown hits 0
  useEffect(() => {
    if (countdown === 0 && photoQueue.length > 0 && printing) {
      setTimeout(() => {
        const chrome = (window as { chrome?: { printToPreview: (c: unknown, cb: (r: unknown) => void) => void } }).chrome;
        const chromeCfg = CHROME_PAPER[printConfig.paperSize];
        if (chrome?.printToPreview && chromeCfg) {
          const { name: chromeName, wMm, hMm } = chromeCfg;
          chrome.printToPreview({
            mediaSize: {
              name: "CUSTOM",
              display_name: "Custom",
              width_microns: Math.round(wMm * 3937.01),
              height_microns: Math.round(hMm * 3937.01),
              imageable_area_left_microns: 0,
              imageable_area_top_microns: 0,
              imageable_area_right_microns: Math.round(wMm * 3937.01),
              imageable_area_bottom_microns: Math.round(hMm * 3937.01),
            },
            targetName: chromeName,
            landscape: printConfig.orientation === "landscape",
            marginsType: 0,
            shouldPrintBackgrounds: true,
            shouldPrintSelectionOnly: false,
          }, () => { window.print(); });
        } else {
          window.print();
        }
        // Advance queue after print dialog
        setPhotoQueue((prev) => {
          const remaining = prev.slice(1);
          setPrinting(remaining.length > 0);
          setGeneratedImage(null);
          if (remaining.length > 0) {
            startCountdownForNext();
          }
          return remaining;
        });
      }, 300);
    }
  }, [countdown, printing, printConfig.paperSize, printConfig.orientation, startCountdownForNext]);

  const handleGenerate = async (buttonId: string) => {
    if (!currentPhoto || generating) return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setGenerating(true);
    setGeneratingButtonId(buttonId);
    setGenError("");
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId: currentPhoto.id, buttonId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setGeneratedImage(data.imageUrl);
    } catch (err: unknown) {
      setGenError((err as Error).message || "Generation failed");
    } finally {
      setGenerating(false);
      setGeneratingButtonId(null);
      countdownRef.current = COUNTDOWN_SECONDS;
      setCountdown(countdownRef.current);
      timerRef.current = setInterval(() => {
        countdownRef.current -= 1;
        setCountdown(countdownRef.current);
        if (countdownRef.current <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }, 1000);
    }
  };

  const handleShowOriginal = () => {
    setGeneratedImage(null);
  };

  const timerColor =
    countdown > 15
      ? "text-white"
      : countdown > 5
      ? "text-yellow-300"
      : "text-red-400";

  const progressPct = (countdown / COUNTDOWN_SECONDS) * 100;
  const paperMeta = PAPER_SIZES[printConfig.paperSize] || PAPER_SIZES["A4"];
  const cssPaperSize = paperMeta.css;
  const printOrientation = printConfig.orientation || paperMeta.orientation;
  const pxW = paperMeta.pxW;
  const pxH = paperMeta.pxH;

  return (
    <main className="min-h-screen bg-black flex items-center justify-center relative select-none overflow-hidden">
      {!currentPhoto || !printing ? (
        <div className="text-center fade-in">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
          <p className="text-white/50 text-xs sm:text-sm font-medium">
            Waiting for photos{queueLength > 0 ? ` (${queueLength - 1} more in queue)` : "…"}
          </p>
        </div>
      ) : (
        <div key={photoKey} className="kiosk-print-area w-full h-full flex flex-col items-center justify-center">
          {/* Photo with fade transition */}
          <div className="relative flex items-center justify-center w-full">
            <img
              src={generatedImage || `/api/frame/${currentPhoto.id}`}
              alt="Captured photo"
              className="max-w-[94vw] sm:max-w-[96vw] max-h-[84vh] sm:max-h-[86vh] object-contain photo-enter"
            />
          </div>

          {/* Countdown + Discard */}
          <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center pb-5 pb-sm-6 pt-16 sm:pt-20 bg-gradient-to-t from-black/60 via-black/30 to-transparent">
            {/* Timer ring */}
            <div className="flex items-center gap-3 sm:gap-5 mb-2 sm:mb-3">
              <div className="relative w-12 h-12 sm:w-14 sm:h-14">
                <svg className="w-12 h-12 sm:w-14 sm:h-14 -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke="rgba(255,255,255,0.15)"
                    strokeWidth="2.5"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.9"
                    fill="none"
                    stroke={countdown > 15 ? "#fff" : countdown > 5 ? "#fbbf24" : "#ef4444"}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={`${progressPct} 100`}
                    className="transition-all duration-1000 ease-linear"
                  />
                </svg>
                <span className={`absolute inset-0 flex items-center justify-center text-xs sm:text-sm font-bold ${timerColor}`}>
                  {Math.ceil(countdown)}
                </span>
              </div>

              <span className="text-white/40 text-[10px] sm:text-xs font-medium">
                {countdown > 0 ? "auto-printing" : "printing…"}
              </span>
            </div>

            {/* Queue indicator */}
            {queueLength > 1 && (
              <span className="text-white/50 text-[10px] sm:text-xs font-medium mb-1.5 sm:mb-2">
                {queueLength} photo{queueLength > 1 ? "s" : ""} in queue
              </span>
            )}

            {/* AI generation buttons */}
            {aiConfig.buttons.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-3 mb-2 justify-center">
                {generatedImage && (
                  <button
                    onClick={handleShowOriginal}
                    className="px-4 py-2 rounded-lg font-medium bg-white/10 hover:bg-white/20 text-white transition-colors"
                  >
                    Show Original
                  </button>
                )}
                {aiConfig.buttons.map((btn) => (
                  <button
                    key={btn.id}
                    onClick={() => handleGenerate(btn.id)}
                    disabled={generating}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                      generating && generatingButtonId === btn.id
                        ? "bg-purple-700 text-white ring-2 ring-purple-400"
                        : "bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white"
                    }`}
                  >
                    {generating && generatingButtonId === btn.id
                      ? `Generating…`
                      : btn.label}
                  </button>
                ))}
              </div>
            )}

            {/* Discard button */}
            <button
              onClick={() => {
                if (timerRef.current) clearInterval(timerRef.current);
                timerRef.current = null;
                countdownRef.current = COUNTDOWN_SECONDS;
                setGeneratedImage(null);
                setPhotoQueue((prev) => {
                  const remaining = prev.slice(1);
                  setPrinting(remaining.length > 0);
                  if (remaining.length > 0) {
                    startCountdownForNext();
                  }
                  return remaining;
                });
              }}
              className="px-5 py-2 sm:px-6 sm:py-2.5 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white/80 hover:text-white rounded-lg text-xs sm:text-sm font-medium transition-colors backdrop-blur-sm"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Error toast */}
      {(error || genError) && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/10 text-white/70 px-4 py-2 rounded-lg text-xs backdrop-blur-sm">
          {genError || error}
        </div>
      )}

      {/* Print CSS — explicit paper-dimension sizing */}
      <style>{`
        @media print {
          @page {
            size: ${cssPaperSize} ${printOrientation};
            margin: 0;
          }

          body * {
            visibility: hidden;
          }
          .kiosk-print-area,
          .kiosk-print-area * {
            visibility: visible;
          }
          .kiosk-print-area {
            position: fixed;
            left: 0;
            top: 0;
            width: ${pxW}px;
            height: ${pxH}px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .kiosk-print-area > div:first-child {
            position: static;
            width: ${pxW}px;
            height: ${pxH}px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .kiosk-print-area img {
            max-width: 100% !important;
            max-height: 100% !important;
            width: auto !important;
            height: auto !important;
            object-fit: contain;
            page-break-inside: avoid;
          }
          .kiosk-print-area > div:last-child {
            display: none !important;
          }

          * {
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </main>
  );
}
