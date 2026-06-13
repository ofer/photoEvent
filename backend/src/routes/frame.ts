import { Request, Response, Router } from "express";
import path from "path";
import fs from "fs";
import sharp from "sharp";

const router = Router();
function getStorageDir() {
  const base = path.resolve(__dirname, "../../storage");
  if (fs.existsSync(base)) return base;
  const fallback = path.resolve(process.cwd(), "storage");
  if (fs.existsSync(fallback)) return fallback;
  return base;
}
const STORAGE_DIR = getStorageDir();

// Event config (mirror of events route)
const eventConfig = {
  name: process.env.EVENT_NAME || "PhotoEvent",
  year: process.env.EVENT_YEAR || "2026",
};

const FRAME_PADDING = 40;
const BOTTOM_BAR_HEIGHT = 100;
const FONT_SIZE = 36;

// GET /api/frame/:id
router.get("/:id", async (req: Request, res: Response) => {
  const photoId = req.params.id;
  const filePath = path.join(STORAGE_DIR, photoId);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Photo not found" });
  }

  try {
    // Read original photo dimensions
    const metadata = await sharp(filePath).metadata();
    const { width: imgW, height: imgH } = metadata;
    if (!imgW || !imgH) {
      throw new Error("Could not read image dimensions");
    }

    // Layout: bottom bar at bottom, photo takes remaining space
    const frameW = Math.max(imgW, 800);
    const frameH = imgH + BOTTOM_BAR_HEIGHT + FRAME_PADDING * 2;

    // Build SVG text overlay for bottom bar (explicit viewBox ensures correct dimensions)
    const svgOverlay = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${frameW}" height="${BOTTOM_BAR_HEIGHT}">
        <rect x="0" y="0" width="${frameW}" height="${BOTTOM_BAR_HEIGHT}" fill="#1e1e1e"/>
        <text x="50%" y="36" text-anchor="middle" fill="white" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="${FONT_SIZE}">${eventConfig.name}</text>
        <text x="50%" y="70" text-anchor="middle" fill="#cccccc" font-family="Helvetica, Arial, sans-serif" font-size="${FONT_SIZE - 8}">${eventConfig.year}</text>
      </svg>`
    );

    // Composite: white background + original photo + SVG bottom bar
    const frame = await sharp(Buffer.alloc(frameW * frameH * 4, 255), {
      raw: { width: frameW, height: frameH, channels: 4 },
    })
      .composite([
        {
          input: filePath,
          top: FRAME_PADDING,
          left: Math.floor((frameW - imgW) / 2),
        },
        {
          input: svgOverlay,
          top: imgH + FRAME_PADDING,
          left: 0,
        },
      ])
      .jpeg({ quality: 90, mozjpeg: false })
      .toBuffer();

    res.set("Content-Type", "image/jpeg");
    res.send(frame);
  } catch (err) {
    console.error("Frame generation failed:", err);
    res.status(500).json({ error: "Frame generation failed" });
  }
});

export { router as frameRouter };
