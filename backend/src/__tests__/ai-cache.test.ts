import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import fs from "fs";
import os from "os";
import path from "path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import app from "../index";
import type { AiConfig, AiButtonConfig } from "../routes/config";

const mockLoadConfig = vi.hoisted(() => vi.fn());

vi.mock("../routes/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../routes/config")>();
  return {
    ...actual,
    loadConfig: mockLoadConfig,
  };
});

const baseConfig = {
  event: { name: "PhotoEvent", year: "2026" },
  frame: {
    paddingPct: 0.025,
    barHeightPct: 0.10,
    fontSizePct: 0.0225,
    barColor: "#1e1e1e",
    barTextColor: "#ffffff",
    subtextColor: "#cccccc",
    backgroundColor: "#ffffff",
  },
  print: { paperSize: "A4", orientation: "landscape", margin: "10mm" },
  ai: { comfyServerUrl: "http://test:8188", buttons: [] as AiButtonConfig[] },
};

function mockConfig(ai: AiConfig): void {
  mockLoadConfig.mockReturnValue({
    ...baseConfig,
    ai,
  });
}

const COMFY_URL = "http://comfy:8188";
const WORKFLOW = JSON.stringify({
  "1": { class_type: "LoadImage", inputs: { image: "placeholder.jpg" } },
});

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

async function makeJpeg(width: number, height: number, color: [number, number, number]): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: color[0], g: color[1], b: color[2] } },
  }).jpeg().toBuffer();
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

interface FetchMock {
  calls: { url: string; method?: string }[];
  comfyCount: () => number;
}

// Routes /api/photos/:id to a fixed buffer and the ComfyUI host through the
// standard sequence: /upload/image → /prompt → /history (empty first, then
// result — or forever empty, or an error) → /view. Records every call.
function installFetchMock(opts: {
  photoBuffer?: Buffer;
  resultImage: Buffer;
  uploadStatus?: number;
  historyError?: string;
  historyNeverResolves?: boolean;
}): FetchMock {
  const calls: { url: string; method?: string }[] = [];
  const promptId = "p1";
  let historyPolls = 0;

  vi.spyOn(global, "fetch").mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
    const u = url.toString();
    calls.push({ url: u, method: init?.method });

    if (u.includes("/api/photos/")) {
      if (!opts.photoBuffer) throw new Error(`Unexpected photo fetch: ${u}`);
      return new Response(opts.photoBuffer, { status: 200, headers: { "content-type": "image/jpeg" } });
    }

    if (!u.startsWith(COMFY_URL)) {
      throw new Error(`Unexpected fetch: ${u}`);
    }
    if (u.includes("/upload/image")) {
      if (opts.uploadStatus) return new Response("upload failed", { status: opts.uploadStatus });
      return json({ name: "uploaded.jpg", subfolder: "", type: "input" });
    }
    if (u.includes("/prompt")) {
      // Each submission starts a fresh polling sequence
      historyPolls = 0;
      return json({ prompt_id: promptId });
    }
    if (u.includes("/history/")) {
      historyPolls += 1;
      if (opts.historyError) {
        return json({ [promptId]: { status: { error: opts.historyError } } });
      }
      if (!opts.historyNeverResolves && historyPolls >= 2) {
        return json({
          [promptId]: {
            outputs: { "1": { images: [{ filename: "out.jpg", subfolder: "", type: "output" }] } },
          },
        });
      }
      return json({});
    }
    if (u.includes("/view")) {
      return new Response(opts.resultImage, { status: 200, headers: { "content-type": "image/png" } });
    }
    throw new Error(`Unexpected ComfyUI fetch: ${u}`);
  });

  return {
    calls,
    comfyCount: () => calls.filter((c) => c.url.startsWith(COMFY_URL)).length,
  };
}

function transformRequest(photo: Buffer, buttonId: string) {
  return request(app)
    .post("/api/ai/transform")
    .field("buttonId", buttonId)
    .attach("photo", photo, "photo.jpg");
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.replace(/^data:image\/\w+;base64,/, ""), "base64");
}

const cartoonButton: AiButtonConfig = { id: "cartoon", label: "Cartoon", workflowJson: WORKFLOW };

describe("AI transform cache", () => {
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-cache-"));
    process.env.AI_CACHE_DIR = cacheDir;
    mockConfig({ comfyServerUrl: COMFY_URL, buttons: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    mockLoadConfig.mockReset();
    fs.rmSync(cacheDir, { recursive: true, force: true });
    delete process.env.AI_CACHE_DIR;
  });

  it("first /transform runs the full ComfyUI sequence and writes a cache file", async () => {
    const photo = await makeJpeg(64, 64, [255, 0, 0]);
    const resultImage = await makeJpeg(100, 100, [0, 255, 0]);
    const { calls, comfyCount } = installFetchMock({ resultImage });
    mockConfig({ comfyServerUrl: COMFY_URL, buttons: [cartoonButton] });

    const res = await transformRequest(photo, "cartoon");

    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(comfyCount()).toBe(5);

    // Full ComfyUI sequence, in order: upload → prompt → history ×2 → view
    const comfyPaths = calls
      .filter((c) => c.url.startsWith(COMFY_URL))
      .map((c) => new URL(c.url).pathname);
    expect(comfyPaths).toEqual(["/upload/image", "/prompt", "/history/p1", "/history/p1", "/view"]);

    // Cache file named <sha256(file bytes)>__<buttonId>.jpg, matching the response
    const cacheFile = path.join(cacheDir, `${sha256Hex(photo)}__cartoon.jpg`);
    expect(fs.existsSync(cacheFile)).toBe(true);
    expect(fs.readFileSync(cacheFile)).toEqual(dataUrlToBuffer(res.body.imageUrl));
  });

  it("second identical /transform is served from cache with zero ComfyUI calls", async () => {
    const photo = await makeJpeg(64, 64, [255, 0, 0]);
    const resultImage = await makeJpeg(100, 100, [0, 255, 0]);
    const { comfyCount } = installFetchMock({ resultImage });
    mockConfig({ comfyServerUrl: COMFY_URL, buttons: [cartoonButton] });

    const first = await transformRequest(photo, "cartoon");
    expect(first.status).toBe(200);
    const comfyAfterFirst = comfyCount();
    expect(comfyAfterFirst).toBeGreaterThan(0);

    const second = await transformRequest(photo, "cartoon");
    expect(second.status).toBe(200);
    expect(second.body.imageUrl).toBe(first.body.imageUrl);
    expect(comfyCount()).toBe(comfyAfterFirst);
  });

  it("computes separate entries for same image + different button and different image + same button", async () => {
    const photoA = await makeJpeg(64, 64, [255, 0, 0]);
    const photoB = await makeJpeg(64, 64, [0, 0, 255]);
    const resultImage = await makeJpeg(100, 100, [0, 255, 0]);
    const { comfyCount } = installFetchMock({ resultImage });
    mockConfig({
      comfyServerUrl: COMFY_URL,
      buttons: [cartoonButton, { id: "oil", label: "Oil", workflowJson: WORKFLOW }],
    });

    expect((await transformRequest(photoA, "cartoon")).status).toBe(200); // compute 1
    expect((await transformRequest(photoA, "oil")).status).toBe(200); // compute 2 (new button)
    expect((await transformRequest(photoB, "cartoon")).status).toBe(200); // compute 3 (new image)
    expect((await transformRequest(photoA, "cartoon")).status).toBe(200); // cache hit
    expect(comfyCount()).toBe(15); // 3 computes × 5 calls each

    expect(fs.readdirSync(cacheDir)).toEqual(
      [
        `${sha256Hex(photoA)}__cartoon.jpg`,
        `${sha256Hex(photoA)}__oil.jpg`,
        `${sha256Hex(photoB)}__cartoon.jpg`,
      ].sort()
    );
  });

  it("shares entries across /transform and /generate for identical image bytes", async () => {
    const photo = await makeJpeg(100, 100, [10, 20, 30]);
    const resultImage = await makeJpeg(100, 100, [0, 255, 0]);
    const { calls, comfyCount } = installFetchMock({ photoBuffer: photo, resultImage });
    mockConfig({ comfyServerUrl: COMFY_URL, buttons: [cartoonButton] });

    const transform = await transformRequest(photo, "cartoon");
    expect(transform.status).toBe(200);
    const comfyAfterTransform = comfyCount();

    const generate = await request(app)
      .post("/api/ai/generate")
      .send({ photoId: "shared.jpg", buttonId: "cartoon" });
    expect(generate.status).toBe(200);
    expect(generate.body.imageUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(comfyCount()).toBe(comfyAfterTransform); // cache hit — no ComfyUI

    // After /transform, the only fetch was /generate's photo self-fetch
    const nonComfy = calls.filter((c) => !c.url.startsWith(COMFY_URL)).map((c) => c.url);
    expect(nonComfy).toEqual([`http://127.0.0.1:${process.env.PORT || 4000}/api/photos/shared.jpg`]);

    // /generate stays framed (regression): the frame adds bar + padding height
    const meta = await sharp(dataUrlToBuffer(generate.body.imageUrl)).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height!).toBeGreaterThan(100);
  });

  it("serves a pre-seeded cache file with zero ComfyUI calls", async () => {
    const photo = await makeJpeg(64, 64, [255, 0, 0]);
    const seeded = await makeJpeg(100, 100, [0, 255, 0]);
    fs.writeFileSync(path.join(cacheDir, `${sha256Hex(photo)}__cartoon.jpg`), seeded);
    const { comfyCount } = installFetchMock({ resultImage: await makeJpeg(100, 100, [1, 2, 3]) });
    mockConfig({ comfyServerUrl: COMFY_URL, buttons: [cartoonButton] });

    const res = await transformRequest(photo, "cartoon");

    expect(res.status).toBe(200);
    expect(dataUrlToBuffer(res.body.imageUrl)).toEqual(seeded);
    expect(comfyCount()).toBe(0);
  });

  it("serves entries from a cache dir it did not write (fresh process, relocated dir)", async () => {
    const photo = await makeJpeg(64, 64, [255, 0, 0]);
    const resultImage = await makeJpeg(100, 100, [0, 255, 0]);
    const { comfyCount } = installFetchMock({ resultImage });
    mockConfig({ comfyServerUrl: COMFY_URL, buttons: [cartoonButton] });

    const first = await transformRequest(photo, "cartoon");
    expect(first.status).toBe(200);
    const comfyAfterCompute = comfyCount();

    // Simulate a fresh app instance: point the lazily-resolved cache dir at a copy.
    const dirB = fs.mkdtempSync(path.join(os.tmpdir(), "ai-cache-"));
    fs.cpSync(cacheDir, dirB, { recursive: true });
    process.env.AI_CACHE_DIR = dirB;
    try {
      const second = await transformRequest(photo, "cartoon");
      expect(second.status).toBe(200);
      expect(second.body.imageUrl).toBe(first.body.imageUrl);
      expect(comfyCount()).toBe(comfyAfterCompute);
    } finally {
      process.env.AI_CACHE_DIR = cacheDir;
      fs.rmSync(dirB, { recursive: true, force: true });
    }
  });

  it("returns the unframed ComfyUI result and never touches /api/frame/", async () => {
    const photo = await makeJpeg(64, 64, [255, 0, 0]);
    const resultImage = await makeJpeg(100, 120, [0, 255, 0]);
    const { calls } = installFetchMock({ resultImage });
    mockConfig({ comfyServerUrl: COMFY_URL, buttons: [cartoonButton] });

    const res = await transformRequest(photo, "cartoon");
    expect(res.status).toBe(200);

    const body = dataUrlToBuffer(res.body.imageUrl);
    // Exactly the raw (re-encoded) ComfyUI output — no frame geometry added
    expect(body).toEqual(await sharp(resultImage).jpeg({ quality: 90 }).toBuffer());
    const meta = await sharp(body).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(120);

    expect(calls.every((c) => !c.url.includes("/api/frame/"))).toBe(true);
    expect(fs.readdirSync(cacheDir)).toEqual([`${sha256Hex(photo)}__cartoon.jpg`]);
  });

  describe("POST /api/ai/transform — validation (400s)", () => {
    it("returns 400 when no photo field is sent", async () => {
      const { comfyCount } = installFetchMock({ resultImage: await makeJpeg(32, 32, [0, 0, 0]) });
      mockConfig({ comfyServerUrl: COMFY_URL, buttons: [cartoonButton] });

      const res = await request(app).post("/api/ai/transform").field("buttonId", "cartoon");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("No photo provided");
      expect(comfyCount()).toBe(0);
    });

    it("returns 400 for non-image files", async () => {
      const res = await request(app)
        .post("/api/ai/transform")
        .field("buttonId", "cartoon")
        .attach("photo", Buffer.from("not an image"), "notes.txt");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Only image files are allowed");
    });

    it("returns 400 for files over the 20MB limit", async () => {
      const res = await request(app)
        .post("/api/ai/transform")
        .field("buttonId", "cartoon")
        .attach("photo", Buffer.alloc(20 * 1024 * 1024 + 1), "big.jpg");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Photo too large. Maximum size is 20MB.");
    });

    it("returns 400 when buttonId is missing", async () => {
      const { comfyCount } = installFetchMock({ resultImage: await makeJpeg(32, 32, [0, 0, 0]) });
      mockConfig({ comfyServerUrl: COMFY_URL, buttons: [cartoonButton] });

      const res = await request(app)
        .post("/api/ai/transform")
        .attach("photo", await makeJpeg(32, 32, [255, 0, 0]), "photo.jpg");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("buttonId is required");
      expect(comfyCount()).toBe(0);
    });

    it("returns 400 for an unknown buttonId", async () => {
      const { comfyCount } = installFetchMock({ resultImage: await makeJpeg(32, 32, [0, 0, 0]) });
      mockConfig({ comfyServerUrl: COMFY_URL, buttons: [cartoonButton] });

      const res = await transformRequest(await makeJpeg(32, 32, [255, 0, 0]), "nonexistent");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Unknown buttonId: nonexistent");
      expect(comfyCount()).toBe(0);
    });

    it("returns 400 when no ComfyUI server URL is configured", async () => {
      const { comfyCount } = installFetchMock({ resultImage: await makeJpeg(32, 32, [0, 0, 0]) });
      mockConfig({ comfyServerUrl: "", buttons: [cartoonButton] });

      const res = await transformRequest(await makeJpeg(32, 32, [255, 0, 0]), "cartoon");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("ComfyUI server URL not configured");
      expect(comfyCount()).toBe(0);
    });

    it("returns 400 when the workflow JSON is empty", async () => {
      mockConfig({ comfyServerUrl: COMFY_URL, buttons: [{ ...cartoonButton, workflowJson: "" }] });

      const res = await transformRequest(await makeJpeg(32, 32, [255, 0, 0]), "cartoon");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("not configured");
    });

    it("returns 400 when the workflow JSON is invalid", async () => {
      mockConfig({ comfyServerUrl: COMFY_URL, buttons: [{ ...cartoonButton, workflowJson: "not json" }] });

      const res = await transformRequest(await makeJpeg(32, 32, [255, 0, 0]), "cartoon");

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("not valid JSON");
    });
  });

  describe("POST /api/ai/transform — ComfyUI failures (500s)", () => {
    it("returns 500 when the ComfyUI upload fails and writes no cache entry", async () => {
      const photo = await makeJpeg(32, 32, [255, 0, 0]);
      const { comfyCount } = installFetchMock({
        resultImage: await makeJpeg(100, 100, [0, 0, 0]),
        uploadStatus: 500,
      });
      mockConfig({ comfyServerUrl: COMFY_URL, buttons: [cartoonButton] });

      const res = await transformRequest(photo, "cartoon");

      expect(res.status).toBe(500);
      expect(res.body.error).toContain("ComfyUI upload failed");
      expect(comfyCount()).toBe(1);
      expect(fs.readdirSync(cacheDir)).toHaveLength(0);
    });

    it("returns 500 when the workflow reports an execution error", async () => {
      const photo = await makeJpeg(32, 32, [255, 0, 0]);
      installFetchMock({
        resultImage: await makeJpeg(100, 100, [0, 0, 0]),
        historyError: "boom",
      });
      mockConfig({ comfyServerUrl: COMFY_URL, buttons: [cartoonButton] });

      const res = await transformRequest(photo, "cartoon");

      expect(res.status).toBe(500);
      expect(res.body.error).toContain("ComfyUI execution error: boom");
      expect(fs.readdirSync(cacheDir)).toHaveLength(0);
    });

    it("returns 500 when the workflow times out (fake timers)", async () => {
      const photo = await makeJpeg(32, 32, [255, 0, 0]);
      const { calls } = installFetchMock({
        resultImage: await makeJpeg(100, 100, [0, 0, 0]),
        historyNeverResolves: true,
      });
      mockConfig({ comfyServerUrl: COMFY_URL, buttons: [cartoonButton] });

      vi.useFakeTimers();
      const resPromise = transformRequest(photo, "cartoon");
      let settled = false;
      void resPromise.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        }
      );

      // History never resolves; advance the default 120s timeout one second at a time.
      for (let i = 0; i < 400 && !settled; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }
      expect(settled).toBe(true);

      const res = await resPromise;
      expect(res.status).toBe(500);
      expect(res.body.error).toContain("timed out");
      expect(calls.filter((c) => c.url.includes("/history/")).length).toBe(120);
      expect(fs.readdirSync(cacheDir)).toHaveLength(0);
    });
  });
});
