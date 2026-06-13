"use client";

import { useState, useEffect, useCallback } from "react";

interface Config {
  event: { name: string; year: string };
  frame: {
    padding: number;
    barHeight: number;
    fontSize: number;
    barColor: string;
    barTextColor: string;
    subtextColor: string;
    backgroundColor: string;
  };
  print: { paperSize: string; orientation: string; margin: string };
}

const PAPER_SIZES = [
  { label: "A4 (210 × 297mm)", value: "A4", orientation: "landscape" },
  { label: "10 × 15 cm (4 × 6 in)", value: "10x15cm", orientation: "landscape" },
  { label: "5 × 7 in", value: "5x7in", orientation: "portrait" },
  { label: "8 × 10 in", value: "8x10in", orientation: "portrait" },
  { label: "Letter (8.5 × 11 in)", value: "letter", orientation: "portrait" },
];

const DEFAULT_CONFIG: Config = {
  event: { name: "PhotoEvent", year: "2026" },
  frame: {
    padding: 40,
    barHeight: 100,
    fontSize: 36,
    barColor: "#1e1e1e",
    barTextColor: "#ffffff",
    subtextColor: "#cccccc",
    backgroundColor: "#ffffff",
  },
  print: { paperSize: "A4", orientation: "landscape", margin: "10mm" },
};

export default function ConfigPage() {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      if (res.ok) {
        const data = await res.json();
        setConfig({ ...DEFAULT_CONFIG, ...data });
      }
    } catch {
      setError("Failed to load config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const update = <K extends keyof Config>(key: K, value: Config[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const updateNested = <K extends keyof Config, J extends keyof Config[K]>(
    section: K,
    field: J,
    value: Config[K][J]
  ) => {
    setConfig((prev) => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Failed to save config");
    } finally {
      setSaving(false);
    }
  };

  const handlePaperChange = (value: string) => {
    const size = PAPER_SIZES.find((s) => s.value === value);
    update("print", { ...config.print, paperSize: value, orientation: size?.orientation || "landscape" });
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-gray-500 animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 bg-white/90 backdrop-blur-sm border-b border-gray-200 px-4 sm:px-6 py-3 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </a>
            <h1 className="text-lg font-semibold">Configuration</h1>
          </div>
          <div className="flex items-center gap-2">
            {saved && (
              <span className="text-green-600 text-sm font-medium">Saved!</span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {error && (
          <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* Event settings */}
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-4 sm:px-5 py-3 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-sm font-semibold text-gray-900">Event</h2>
          </div>
          <div className="p-4 sm:p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Event name</label>
              <input
                type="text"
                value={config.event.name}
                onChange={(e) => updateNested("event", "name", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
              <input
                type="text"
                value={config.event.year}
                onChange={(e) => updateNested("event", "year", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </section>

        {/* Frame settings */}
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-4 sm:px-5 py-3 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-sm font-semibold text-gray-900">Frame</h2>
          </div>
          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Padding (px)</label>
                <input
                  type="number"
                  value={config.frame.padding}
                  onChange={(e) => updateNested("frame", "padding", Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Bar height (px)</label>
                <input
                  type="number"
                  value={config.frame.barHeight}
                  onChange={(e) => updateNested("frame", "barHeight", Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Font size (px)</label>
              <input
                type="number"
                value={config.frame.fontSize}
                onChange={(e) => updateNested("frame", "fontSize", Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Colors */}
            <div className="space-y-3">
              <label className="block text-xs font-medium text-gray-500">Colors</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Bar", key: "barColor" as const },
                  { label: "Bar text", key: "barTextColor" as const },
                  { label: "Year text", key: "subtextColor" as const },
                  { label: "Background", key: "backgroundColor" as const },
                ].map(({ label, key }) => (
                  <div key={key} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={config.frame[key]}
                      onChange={(e) => updateNested("frame", key, e.target.value)}
                      className="w-8 h-8 rounded-lg border border-gray-200 cursor-pointer p-0.5 bg-white"
                    />
                    <span className="text-sm text-gray-600">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="pt-3 border-t border-gray-100">
              <div className="text-xs font-medium text-gray-500 mb-2">Preview</div>
              <div
                className="rounded-xl overflow-hidden shadow-sm border border-gray-100"
                style={{
                  backgroundColor: config.frame.backgroundColor,
                  maxHeight: "180px",
                }}
              >
                {/* Photo placeholder area */}
                <div className="h-28 bg-gray-50 flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-gray-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                {/* Frame bar */}
                <div
                  className="px-4 py-2 flex flex-col items-center"
                  style={{ backgroundColor: config.frame.barColor }}
                >
                  <span
                    className="font-bold"
                    style={{
                      color: config.frame.barTextColor,
                      fontSize: `${config.frame.fontSize * 0.35}rem`,
                    }}
                  >
                    {config.event.name}
                  </span>
                  <span
                    style={{
                      color: config.frame.subtextColor,
                      fontSize: `${(config.frame.fontSize - 8) * 0.35}rem`,
                    }}
                  >
                    {config.event.year}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Print settings */}
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-4 sm:px-5 py-3 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-sm font-semibold text-gray-900">Print</h2>
          </div>
          <div className="p-4 sm:p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Paper size</label>
              <select
                value={config.print.paperSize}
                onChange={(e) => handlePaperChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                {PAPER_SIZES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-start gap-1.5 text-xs text-gray-400 mt-1">
              <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Orientation adjusts automatically</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
