import { Request, Response, Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import { notifyNewPhoto } from "../sse";

const router = Router();
const STORAGE_DIR = path.resolve(__dirname, "../../storage");

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
router.post("/", upload.single("photo"), (req: Request, res: Response) => {
  if (req instanceof Error) {
    return res.status(400).json({ error: req.message });
  }

  if (!req.file) {
    return res.status(400).json({ error: "No photo provided" });
  }

  const filename = req.file.filename;
  const filePath = path.join(STORAGE_DIR, filename);
  const originalName = req.file.originalname;

  (async () => {
    try {
      const thumbPath = path.join(STORAGE_DIR, `thumb_${filename}`);
      await sharp(filePath)
        .resize(400, 400, { fit: "cover" })
        .jpeg({ quality: 75 })
        .toFile(thumbPath);
    } catch (err) {
      console.error("Thumbnail generation failed:", err);
    }

    const photo = {
      id: filename,
      name: originalName,
      timestamp: new Date().toISOString(),
      url: `/api/photos/${filename}`,
      thumb: `/api/photos/thumb_${filename}`,
    };

    notifyNewPhoto(photo);

    if (!res.headersSent) {
      res.status(201).json(photo);
    }
  })().catch((err) => {
    console.error("Upload error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Upload failed" });
    }
  });
});

// GET /api/photos
router.get("/", (_req: Request, res: Response) => {
  const files = fs.readdirSync(STORAGE_DIR);
  const photos = files
    .filter((f) => !f.startsWith("thumb_"))
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
