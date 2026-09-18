import { Request, Response, Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import { notifyNewPhoto } from "../sse";

const router = Router();
function getStorageDir() {
  const base = path.resolve(__dirname, "../../storage");
  if (fs.existsSync(base)) return base;
  const fallback = path.resolve(process.cwd(), "storage");
  if (fs.existsSync(fallback)) return fallback;
  return base;
}
const STORAGE_DIR = getStorageDir();

if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req: Request, _file: any, cb: any) => cb(null, STORAGE_DIR),
  filename: (_req: Request, file: any, cb: any) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${timestamp}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req: Request, file: any, cb: any) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// POST /api/photos
router.post("/", upload.single("photo"), async (req: Request, res: Response) => {
  if (req instanceof Error) {
    return res.status(400).json({ error: req.message });
  }

  if (!req.file) {
    return res.status(400).json({ error: "No photo provided" });
  }

  const filename = req.file.filename;
  const filePath = path.join(STORAGE_DIR, filename);
  const originalName = req.file.originalname;

  // Optional AI transformation choice from the phone's review screen.
  // No validation against the AI config here — a stale/unknown id degrades
  // gracefully at the kiosk later (original photo shown).
  const rawAiButton =
    typeof req.body.aiButton === "string" ? req.body.aiButton.trim() : "";
  const aiButton: string | null = rawAiButton.length > 0 ? rawAiButton : null;

  // Wait for multer to finish writing the file before proceeding.
  // Multer's diskStorage streams the file, and next() may be called
  // before the OS has fully flushed the data to disk. If we send the
  // response or SSE notification before the file is ready, the kiosk
  // will request the framed image and get a 404 (broken image).
  await new Promise<void>((resolve, reject) => {
    let retries = 0;
    const check = () => {
      if (fs.existsSync(filePath)) {
        resolve();
        return;
      }
      retries++;
      if (retries > 20) {
        reject(new Error("File not written to disk after 1s"));
        return;
      }
      setTimeout(check, 50);
    };
    check();
  });

  const photo = {
    id: filename,
    name: originalName,
    timestamp: new Date().toISOString(),
    url: `/api/photos/${filename}`,
    thumb: `/api/photos/thumb_${filename}`,
    aiButton,
  };

  // Generate thumbnail asynchronously — don't block the response
  const thumbPath = path.join(STORAGE_DIR, `thumb_${filename}`);
  sharp(filePath)
    .resize(400, 400, { fit: "cover" })
    .jpeg({ quality: 75 })
    .toFile(thumbPath)
    .catch((err) => {
      console.error("Thumbnail error:", err);
    });

  res.status(201).json(photo);
  if (process.env.NODE_ENV !== "test") {
    notifyNewPhoto(photo);
  }
});

// GET /api/photos
router.get("/", (_req: Request, res: Response) => {
  const files = fs.readdirSync(STORAGE_DIR);
  const photos = files
    .filter((f) => {
      const fullPath = path.join(STORAGE_DIR, f);
      return !f.startsWith("thumb_") && !f.startsWith(".") && !fs.statSync(fullPath).isDirectory();
    })
    .map((filename) => ({
      id: filename,
      name: filename,
      timestamp: new Date().toISOString(),
      url: `/api/photos/${filename}`,
      thumb: `/api/photos/thumb_${filename}`,
    }))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  res.json(photos);
});

// GET /api/photos/:filename
router.get("/:filename", (req: Request, res: Response) => {
  const filePath = path.join(STORAGE_DIR, req.params.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Photo not found" });
  }

  res.sendFile(filePath);
});

export { router as photoRouter };
