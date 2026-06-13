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
  // Env vars take precedence over everything for event settings when set
  const envOverrides: Record<string, string> = {};
  if (process.env.EVENT_NAME) envOverrides.name = process.env.EVENT_NAME;
  if (process.env.EVENT_YEAR) envOverrides.year = process.env.EVENT_YEAR;
  return {
    event: { ...getDefaultConfig().event, ...config.event, ...envOverrides },
    frame: { ...getDefaultConfig().frame, ...config.frame },
    print: { ...getDefaultConfig().print, ...config.print },
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
    frame: req.body.frame ? { ...existing.frame, ...req.body.frame } : existing.frame,
    print: req.body.print ? { ...existing.print, ...req.body.print } : existing.print,
  });

  saveConfig(config);
  res.json(config);
});

export { router as configRouter, loadConfig };
