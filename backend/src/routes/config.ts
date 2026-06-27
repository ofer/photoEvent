import { Request, Response, Router } from "express";
import fs from "fs";
import path from "path";

const router = Router();

// Use a subdirectory so cleanStorage (photos.test.ts) doesn't delete it
const CONFIG_DIR = path.resolve(__dirname, "../../storage/config");
const CONFIG_PATH = path.join(CONFIG_DIR, "settings.json");

export interface AiButtonConfig {
  id: string;
  label: string;
  workflowJson: string;
}

export interface AiConfig {
  comfyServerUrl: string;
  buttons: AiButtonConfig[];
}

function getDefaultConfig() {
  return {
    event: { name: process.env.EVENT_NAME || "PhotoEvent", year: process.env.EVENT_YEAR || "2026" },
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
    ai: { comfyServerUrl: "http://10.0.0.17:8188", buttons: [] as AiButtonConfig[] },
  };
}

// Env vars act as fallback defaults when no config file exists.
// Once the user has explicitly saved config via the UI, env vars
// do NOT override their persisted values.
function getDefaultConfigWithoutEnv(): ReturnType<typeof getDefaultConfig> {
  return {
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
    ai: { comfyServerUrl: "http://10.0.0.17:8188", buttons: [] as AiButtonConfig[] },
  };
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
      const saved = JSON.parse(raw) as Partial<ReturnType<typeof getDefaultConfig>>;
      return mergeWithDefaults(saved);
    }
  } catch {
    // ignore
  }
  return getDefaultConfig();
}

function loadRawConfig(): Partial<ReturnType<typeof getDefaultConfig>> {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

function saveConfig(config: ReturnType<typeof getDefaultConfig>) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

function mergeWithDefaults(config: Partial<ReturnType<typeof getDefaultConfig>>): ReturnType<typeof getDefaultConfig> {
  const defaults = getDefaultConfigWithoutEnv();
  const raw = loadRawConfig();

  // Build existing config without recursive mergeWithDefaults call
  const rawEvent = raw.event as { name?: string; year?: string } | undefined;
  const rawFrame = raw.frame as Partial<ReturnType<typeof getDefaultConfig>["frame"]> | undefined;
  const rawPrint = raw.print as { paperSize?: string; orientation?: string; margin?: string } | undefined;
  const rawAi = raw.ai as AiConfig | undefined;

  const existing: ReturnType<typeof getDefaultConfig> = {
    event: rawEvent ? { ...defaults.event, ...rawEvent } : defaults.event,
    frame: rawFrame ? { ...defaults.frame, ...rawFrame } : defaults.frame,
    print: rawPrint ? { ...defaults.print, ...rawPrint } : defaults.print,
    ai: rawAi ? { ...defaults.ai, ...rawAi } : defaults.ai,
  };

  // Merge incoming sections
  const incomingEvent = config.event as { name?: string; year?: string } | undefined;
  const incomingFrame = config.frame as ReturnType<typeof getDefaultConfig>["frame"] | undefined;
  const incomingPrint = config.print as { paperSize?: string; orientation?: string; margin?: string } | undefined;
  const incomingAi = config.ai as AiConfig | undefined;

  return {
    event: incomingEvent ? { ...existing.event, ...incomingEvent } : existing.event,
    frame: incomingFrame
      ? sanitizeFrame(incomingFrame, existing.frame)
      : existing.frame,
    print: incomingPrint ? { ...existing.print, ...incomingPrint } : existing.print,
    ai: incomingAi
      ? (() => {
          // If buttons is explicitly set to empty, treat as a reset — fall back to defaults.
          // If buttons is explicitly set to non-empty, use it.
          // If buttons is not sent at all, preserve existing buttons and URL.
          const hasButtons = "buttons" in incomingAi;
          const buttonsValue = hasButtons ? incomingAi.buttons : undefined;
          return {
            comfyServerUrl:
              incomingAi.comfyServerUrl ??
              (hasButtons && Array.isArray(buttonsValue) && buttonsValue.length === 0
                ? defaults.ai.comfyServerUrl
                : existing.ai.comfyServerUrl),
            buttons: hasButtons
              ? (buttonsValue ?? existing.ai.buttons)
              : existing.ai.buttons,
          };
        })()
      : existing.ai,
  };
}

function sanitizeFrame(
  incoming: Partial<ReturnType<typeof getDefaultConfig>["frame"]>,
  existing: ReturnType<typeof getDefaultConfig>["frame"],
): ReturnType<typeof getDefaultConfig>["frame"] {
  const sanitize = <T extends number>(value: T | undefined, fallback: T, min: number, max: number): T =>
    typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
      ? (value as T)
      : fallback;

  return {
    padding: sanitize(incoming.padding, existing.padding ?? 40, 0, 200),
    barHeight: sanitize(incoming.barHeight, existing.barHeight ?? 100, 50, 1000),
    fontSize: sanitize(incoming.fontSize, existing.fontSize ?? 36, 8, 200),
    barColor: incoming.barColor ?? existing.barColor ?? "#1e1e1e",
    barTextColor: incoming.barTextColor ?? existing.barTextColor ?? "#ffffff",
    subtextColor: incoming.subtextColor ?? existing.subtextColor ?? "#cccccc",
    backgroundColor: incoming.backgroundColor ?? existing.backgroundColor ?? "#ffffff",
  };
}

// GET /api/config
router.get("/", (_req: Request, res: Response) => {
  res.json(loadConfig());
});

// PUT /api/config
router.put("/", (req: Request, res: Response) => {
  const config = mergeWithDefaults(req.body);

  saveConfig(config);
  res.json(config);
});

export { router as configRouter, loadConfig };
