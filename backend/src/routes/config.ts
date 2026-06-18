import { Request, Response, Router } from "express";
import fs from "fs";
import path from "path";

const router = Router();

// Use a subdirectory so cleanStorage (photos.test.ts) doesn't delete it
const CONFIG_DIR = path.resolve(__dirname, "../../storage/config");
const CONFIG_PATH = path.join(CONFIG_DIR, "settings.json");

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

function saveConfig(config: ReturnType<typeof getDefaultConfig>) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

function mergeWithDefaults(config: Partial<ReturnType<typeof getDefaultConfig>>): ReturnType<typeof getDefaultConfig> {
  const defaults = getDefaultConfigWithoutEnv();
  return {
    event: { ...defaults.event, ...config.event },
    frame: { ...defaults.frame, ...config.frame },
    print: { ...defaults.print, ...config.print },
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
  const existing = loadConfig();

  const config = mergeWithDefaults({
    event: req.body.event ? { ...existing.event, ...req.body.event } : existing.event,
    frame: req.body.frame
      ? sanitizeFrame(req.body.frame, existing.frame)
      : existing.frame,
    print: req.body.print ? { ...existing.print, ...req.body.print } : existing.print,
  });

  saveConfig(config);
  res.json(config);
});

export { router as configRouter, loadConfig };
