import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { loadConfig } from "./config";
import type { AiButtonConfig } from "./config";
import { generateFrame } from "./frame";

const router = Router();

// Upload image to ComfyUI's input directory
async function uploadToComfyUI(
  comfyUrl: string,
  imageBase64: string, // full data URL
  fileName: string
): Promise<{ name: string; subfolder: string; type: string }> {
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");

  const formData = new FormData();
  const blob = new Blob([buffer], { type: "image/jpeg" });
  formData.append("image", blob, fileName);

  const res = await fetch(`${comfyUrl}/upload/image`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI upload failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<{ name: string; subfolder: string; type: string }>;
}

// Submit workflow to ComfyUI
async function submitWorkflow(
  comfyUrl: string,
  workflowJson: string,
  uploadedFileName: string,
  uploadedType: string
): Promise<string> {
  const workflow = JSON.parse(workflowJson) as Record<string, any>;

  // Replace LoadImage node's "image" input with the uploaded file reference
  for (const [, node] of Object.entries(workflow)) {
    if (node.class_type === "LoadImage" && typeof node.inputs?.image === "string") {
      node.inputs.image = uploadedFileName;
      node.inputs.upload = "image";
    }
  }

  const res = await fetch(`${comfyUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: "kiosk-" + Date.now() }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ComfyUI prompt failed (${res.status}): ${text}`);
  }

  const data = await res.json() as { prompt_id: string };
  return data.prompt_id;
}

// Poll ComfyUI history for result
async function waitForResult(
  comfyUrl: string,
  promptId: string,
  timeoutMs: number = 120_000 // 2 minute timeout
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${comfyUrl}/history/${promptId}`);
    if (!res.ok) {
      throw new Error(`ComfyUI history check failed (${res.status})`);
    }
    const history = await res.json() as Record<string, any>;
    const promptHistory = history[promptId];

    if (promptHistory) {
      const outputs = promptHistory.outputs;
      if (outputs) {
        for (const [, nodeResult] of Object.entries(outputs)) {
          const images = (nodeResult as any).images;
          if (images && Array.isArray(images) && images.length > 0) {
            const imageRef = images[0];
            const filename = imageRef.filename;
            const subfolder = imageRef.subfolder || "";
            const type = imageRef.type || "output";

            const imgRes = await fetch(
              `${comfyUrl}/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=${type}`
            );
            if (!imgRes.ok) {
              throw new Error(`Failed to fetch generated image (${imgRes.status})`);
            }
            const arrayBuffer = await imgRes.arrayBuffer();
            const base64 = Buffer.from(arrayBuffer).toString("base64");
            const contentType = imgRes.headers.get("content-type") || "image/png";
            return `data:${contentType};base64,${base64}`;
          }
        }
      }

      if (promptHistory.status?.error) {
        throw new Error(`ComfyUI execution error: ${promptHistory.status.error}`);
      }
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  throw new Error(`ComfyUI workflow timed out after ${timeoutMs}ms`);
}

// ── Transform cache ─────────────────────────────────────────────────────────
// AI transform results are cached on disk so the phone preview endpoint
// (/api/ai/transform) and the kiosk endpoint (/api/ai/generate) share one
// compute per (image content, button) pair. Entries are unframed JPEGs named
// <sha256(original image bytes)>__<buttonId>.jpg. The cache lives next to the
// photo storage; AI_CACHE_DIR (absolute path) overrides the location, which
// tests use to keep the cache hermetic.

function resolveStorageRoot(): string {
  const base = path.resolve(__dirname, "../../storage");
  if (fs.existsSync(base)) return base;
  const fallback = path.resolve(process.cwd(), "storage");
  if (fs.existsSync(fallback)) return fallback;
  return base;
}

// Resolved lazily on every call so AI_CACHE_DIR can be repointed per test.
function getCacheDir(): string {
  const override = process.env.AI_CACHE_DIR;
  if (override) return override;
  return path.join(resolveStorageRoot(), "ai-cache");
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function cachePathFor(imageBuffer: Buffer, buttonId: string): string {
  const dir = getCacheDir();
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${sha256(imageBuffer)}__${buttonId}.jpg`);
}

// Run the raw ComfyUI pipeline (upload → submit with LoadImage rewrite →
// poll history ≤ timeoutMs → view) and return the result as a data URL.
async function runComfyWorkflow(
  imageBuffer: Buffer,
  workflowStr: string,
  comfyUrl: string,
  timeoutMs: number = 120_000 // 2 minute timeout
): Promise<string> {
  const uploadResult = await uploadToComfyUI(
    comfyUrl,
    `data:image/jpeg;base64,${imageBuffer.toString("base64")}`,
    `kiosk_${sha256(imageBuffer).slice(0, 12)}.jpg`
  );

  const promptId = await submitWorkflow(comfyUrl, workflowStr, uploadResult.name, uploadResult.type);

  return waitForResult(comfyUrl, promptId, timeoutMs);
}

type WorkflowCheck =
  | { ok: true; workflowStr: string }
  | { ok: false; reason: "missing" | "invalid" };

// Accept either a JSON string or a parsed object (object is more readable
// in settings.json; string is what the UI sends).
function checkWorkflow(workflowJson: unknown): WorkflowCheck {
  if (!workflowJson) {
    return { ok: false, reason: "missing" };
  }
  if (typeof workflowJson === "string") {
    try {
      JSON.parse(workflowJson);
    } catch {
      return { ok: false, reason: "invalid" };
    }
    return { ok: true, workflowStr: workflowJson };
  }
  return { ok: true, workflowStr: JSON.stringify(workflowJson) };
}

function workflowError(buttonId: string, reason: "missing" | "invalid"): string {
  return reason === "missing"
    ? `Workflow JSON not configured for button: ${buttonId}`
    : `Workflow JSON for button '${buttonId}' is not valid JSON`;
}

// Compute (or fetch from the disk cache) the unframed JPEG result of applying
// the button's workflow to the given image bytes.
async function transformImage(
  imageBuffer: Buffer,
  btn: AiButtonConfig,
  comfyUrl: string,
  timeoutMs?: number
): Promise<Buffer> {
  const cachePath = cachePathFor(imageBuffer, btn.id);
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath);
  }

  const check = checkWorkflow(btn.workflowJson);
  if (!check.ok) {
    throw new Error(workflowError(btn.id, check.reason));
  }

  const resultDataUrl = await runComfyWorkflow(imageBuffer, check.workflowStr, comfyUrl, timeoutMs);
  const base64Data = resultDataUrl.replace(/^data:[^,]+,/, "");
  // Re-encode as JPEG so the cache entry is a genuine JPEG regardless of the
  // content-type ComfyUI returned.
  const jpegBuffer = await sharp(Buffer.from(base64Data, "base64")).jpeg({ quality: 90 }).toBuffer();
  fs.writeFileSync(cachePath, jpegBuffer);
  return jpegBuffer;
}

// ── /api/ai/transform upload (phone preview) ────────────────────────────────

const transformUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// Run multer as a wrapped middleware so its errors surface as JSON 400s
// instead of falling through to the global error middleware (which answers
// LIMIT_FILE_SIZE with a 413).
function uploadSinglePhoto(req: Request, res: Response, next: NextFunction): void {
  transformUpload.single("photo")(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ error: "Photo too large. Maximum size is 20MB." });
      return;
    }
    if (err instanceof multer.MulterError || err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(new Error("Photo upload failed"));
  });
}

// POST /api/ai/generate
router.post("/generate", async (req: Request, res: Response) => {
  try {
    const { photoId, buttonId } = req.body;
    if (!photoId) {
      return res.status(400).json({ error: "photoId is required" });
    }
    if (!buttonId) {
      return res.status(400).json({ error: "buttonId is required" });
    }

    const config = loadConfig();
    const { comfyServerUrl, buttons } = config.ai;

    if (!comfyServerUrl) {
      return res.status(400).json({ error: "ComfyUI server URL not configured" });
    }

    const btn = buttons.find((b) => b.id === buttonId);
    if (!btn) {
      return res.status(400).json({ error: `Unknown buttonId: ${buttonId}` });
    }

    const check = checkWorkflow(btn.workflowJson);
    if (!check.ok) {
      return res.status(400).json({ error: workflowError(buttonId, check.reason) });
    }

    const photoRes = await fetch(`http://127.0.0.1:${process.env.PORT || 4000}/api/photos/${photoId}`);
    if (!photoRes.ok) {
      return res.status(400).json({ error: `Failed to fetch raw photo (${photoRes.status})` });
    }
    const photoBuffer = Buffer.from(await photoRes.arrayBuffer());

    const jpegBuffer = await transformImage(photoBuffer, btn, comfyServerUrl);
    const framedBuffer = await generateFrame(jpegBuffer);

    res.json({ imageUrl: `data:image/jpeg;base64,${framedBuffer.toString("base64")}` });
  } catch (err: any) {
    console.error("AI generate error:", err.message);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// POST /api/ai/transform — phone preview: multipart photo + buttonId,
// cached pipeline, UNFRAMED data URL response (the kiosk frames at print).
router.post("/transform", uploadSinglePhoto, async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No photo provided" });
    }

    const { buttonId } = req.body;
    if (!buttonId) {
      return res.status(400).json({ error: "buttonId is required" });
    }

    const config = loadConfig();
    const { comfyServerUrl, buttons } = config.ai;

    if (!comfyServerUrl) {
      return res.status(400).json({ error: "ComfyUI server URL not configured" });
    }

    const btn = buttons.find((b) => b.id === buttonId);
    if (!btn) {
      return res.status(400).json({ error: `Unknown buttonId: ${buttonId}` });
    }

    const check = checkWorkflow(btn.workflowJson);
    if (!check.ok) {
      return res.status(400).json({ error: workflowError(buttonId, check.reason) });
    }

    const jpegBuffer = await transformImage(req.file.buffer, btn, comfyServerUrl);

    res.json({ imageUrl: `data:image/jpeg;base64,${jpegBuffer.toString("base64")}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("AI transform error:", message);
    res.status(500).json({ error: message });
  }
});

export { router as aiRouter };
