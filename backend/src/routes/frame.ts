import { Request, Response, Router } from "express";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import { loadConfig } from "./config";

const router = Router();
function getStorageDir() {
  const base = path.resolve(__dirname, "../../storage");
  if (fs.existsSync(base)) return base;
  const fallback = path.resolve(process.cwd(), "storage");
  if (fs.existsSync(fallback)) return fallback;
  return base;
}
const STORAGE_DIR = getStorageDir();

async function generateFrame(imageInput: Buffer | string): Promise<Buffer> {
  const cfg = loadConfig();
  const frameCfg = cfg.frame;
  const eventCfg = cfg.event;

  // Rotate to apply EXIF orientation tag, then read metadata from the
  // correctly-oriented buffer. This ensures frame dimensions are computed
  // from the intended orientation (e.g. portrait), not the raw pixel layout
  // (which phones store as landscape with an EXIF rotation hint).
  const rotated = await sharp(imageInput).rotate().jpeg().toBuffer();
  const metadata = await sharp(rotated).metadata();
  const imgW = metadata.width;
  const imgH = metadata.height;
  if (!imgW || !imgH) {
    throw new Error("Could not read image dimensions");
  }

  const padding = Math.round(imgW * frameCfg.paddingPct);
  const barHeight = Math.round(imgH * frameCfg.barHeightPct);
  const fontSize = Math.round(imgW * frameCfg.fontSizePct);

  const frameW = imgW;
  const frameH = imgH + barHeight + padding * 2;

  const bgR = parseInt(frameCfg.backgroundColor.slice(1, 3), 16);
  const bgG = parseInt(frameCfg.backgroundColor.slice(3, 5), 16);
  const bgB = parseInt(frameCfg.backgroundColor.slice(5, 7), 16);
  const bgBuffer = Buffer.alloc(frameW * frameH * 4, 255);
  for (let i = 0; i < bgBuffer.length; i += 4) {
    bgBuffer[i] = bgR;
    bgBuffer[i + 1] = bgG;
    bgBuffer[i + 2] = bgB;
  }

  const nameFontSize = fontSize;
  const yearFontSize = Math.max(Math.round(fontSize * 0.75), 8);
  const lineGap = Math.round(fontSize * 0.25);
  const baselineRatio = 0.8;
  const textBlockHeight = nameFontSize + lineGap + yearFontSize;
  const textBlockTop = (barHeight - textBlockHeight) / 2;
  const nameBaseline = Math.round(textBlockTop + nameFontSize * baselineRatio);
  const yearBaseline = Math.round(
    textBlockTop + nameFontSize + lineGap + yearFontSize * baselineRatio
  );

  const svgOverlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${frameW}" height="${barHeight}">
      <rect x="0" y="0" width="${frameW}" height="${barHeight}" fill="${frameCfg.barColor}"/>
      <text x="50%" y="${nameBaseline}" text-anchor="middle" fill="${frameCfg.barTextColor}" font-family="DejaVu Sans, Helvetica, Arial, sans-serif" font-weight="bold" font-size="${nameFontSize}">${eventCfg.name}</text>
      <text x="50%" y="${yearBaseline}" text-anchor="middle" fill="${frameCfg.subtextColor}" font-family="DejaVu Sans, Helvetica, Arial, sans-serif" font-size="${yearFontSize}">${eventCfg.year}</text>
    </svg>`
  );

  return sharp(bgBuffer, {
    raw: { width: frameW, height: frameH, channels: 4 },
  })
    .composite([
      {
        input: rotated,
        top: padding,
        left: Math.floor((frameW - imgW) / 2),
      },
      {
        input: svgOverlay,
        top: imgH + padding,
        left: 0,
      },
    ])
    .jpeg({ quality: 90, mozjpeg: false })
    .toBuffer();
}

// GET /api/frame/:id
router.get("/:id", async (req: Request, res: Response) => {
  const photoId = req.params.id;
  const filePath = path.join(STORAGE_DIR, photoId);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Photo not found" });
  }

  try {
    const frame = await generateFrame(filePath);
    res.set("Content-Type", "image/jpeg");
    res.send(frame);
  } catch (err) {
    console.error("Frame generation failed:", err);
    res.status(500).json({ error: "Frame generation failed" });
  }
});

export { router as frameRouter, generateFrame };
