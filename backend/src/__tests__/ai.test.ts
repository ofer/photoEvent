import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
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
    padding: 40,
    barHeight: 100,
    fontSize: 36,
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

describe("AI Route", () => {
  beforeEach(() => {
    mockConfig({ comfyServerUrl: "http://test:8188", buttons: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockLoadConfig.mockReset();
  });

  // ── Validation tests (fail fast, no fetch needed) ─────────────────

  describe("POST /api/ai/generate — validation", () => {
    it("returns 400 when photoId is missing", async () => {
      const res = await request(app).post("/api/ai/generate").send({ buttonId: "cartoon" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("photoId is required");
    });

    it("returns 400 when buttonId is missing", async () => {
      const res = await request(app).post("/api/ai/generate").send({ photoId: "test.jpg" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("buttonId is required");
    });

    it("returns 400 when body is empty", async () => {
      const res = await request(app).post("/api/ai/generate").send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("photoId is required");
    });

    it("returns 400 when buttonId does not match any configured button", async () => {
      const res = await request(app).post("/api/ai/generate").send({ photoId: "test.jpg", buttonId: "nonexistent" });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Unknown buttonId");
      expect(res.body.error).toContain("nonexistent");
    });

    it("returns 400 when the selected button's workflow JSON is empty", async () => {
      mockConfig({
        comfyServerUrl: "http://test:8188",
        buttons: [{ id: "empty", label: "Empty", workflowJson: "" }],
      });
      const res = await request(app).post("/api/ai/generate").send({ photoId: "test.jpg", buttonId: "empty" });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("not configured");
    });

    it("returns 400 when the selected button's workflow JSON is invalid", async () => {
      mockConfig({
        comfyServerUrl: "http://test:8188",
        buttons: [{ id: "bad", label: "Bad", workflowJson: "not json" }],
      });
      const res = await request(app).post("/api/ai/generate").send({ photoId: "test.jpg", buttonId: "bad" });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("not valid JSON");
    });

    it("returns 404 for non-existent route", async () => {
      const res = await request(app).post("/api/nonexistent").send({});
      expect(res.status).toBe(404);
    });
  });

  // ── Integration tests (use fetch mocks to verify request sequence) ─

  describe("POST /api/ai/generate — workflow with mocked fetch", () => {
    it("fetches raw photo via /api/photos/:id, then uploads to ComfyUI", async () => {
      const photoId = "raw-photo.jpg";
      const buttonId = "cartoon";
      const rawPhotoData = Buffer.from("raw-photo-bytes");
      const comfyUrl = "http://comfy:8188";
      const workflowJson = JSON.stringify({
        "1": { class_type: "LoadImage", inputs: { image: "placeholder.jpg" } },
      });

      const fetchCalls: { url: string; method?: string }[] = [];
      const responses: Response[] = [];

      // Stage the responses
      responses.push(
        new Response(rawPhotoData, {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        })
      ); // → fetch backend /api/photos/:id

      responses.push(
        new Response(JSON.stringify({
          filename: "kiosk_raw-photo.jpg_cartoon.jpg",
          subfolder: "",
          type: "input",
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      ); // → ComfyUI /upload/image

      responses.push(
        new Response(JSON.stringify({ prompt_id: "mock-prompt-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      ); // → ComfyUI /prompt

      // First history poll: no result yet
      responses.push(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      ); // → ComfyUI /history/:promptId

      // Second history poll: result ready
      const sharp = (await import("sharp")).default;
      const resultImage = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
      }).jpeg().toBuffer();
      responses.push(
        new Response(JSON.stringify({
          "mock-prompt-1": {
            outputs: {
              "1": { images: [{ filename: "output.jpg", subfolder: "", type: "output" }] },
            },
          },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      ); // → ComfyUI /history/:promptId (result)

      responses.push(
        new Response(resultImage, {
          status: 200,
          headers: { "content-type": "image/png" },
        })
      ); // → ComfyUI /view

      vi.spyOn(global, "fetch").mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        const urlString = url.toString();
        fetchCalls.push({ url: urlString, method: init?.method });
        const resp = responses.shift();
        if (resp) return resp;
        return new Response(JSON.stringify({}), { status: 200 });
      });

      mockConfig({
        comfyServerUrl: comfyUrl,
        buttons: [{ id: buttonId, label: "Cartoon", workflowJson }],
      });

      const res = await request(app)
        .post("/api/ai/generate")
        .send({ photoId, buttonId });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("imageUrl");
      expect(res.body.imageUrl).toMatch(/^data:image\/jpeg;base64,/);

      // Verify fetch sequence
      expect(fetchCalls.length).toBeGreaterThanOrEqual(2);
      expect(fetchCalls[0].url).toMatch(/\/api\/photos\/raw-photo\.jpg$/);
      for (const call of fetchCalls) {
        expect(call.url).not.toMatch(/\/api\/frame\//);
      }
    });

    it("returns 500 when ComfyUI upload fails", async () => {
      const photoId = "test.jpg";
      const buttonId = "cartoon";
      const rawPhotoData = Buffer.from("raw-bytes");
      const workflowJson = JSON.stringify({
        "1": { class_type: "LoadImage", inputs: { image: "placeholder.jpg" } },
      });

      vi.spyOn(global, "fetch").mockImplementation(async (url: string | URL | Request) => {
        const urlString = url.toString();
        if (urlString.includes("/api/photos/")) {
          return new Response(rawPhotoData, { status: 200 });
        }
        if (urlString.includes("/upload/image")) {
          return new Response("upload failed", { status: 500 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      });

      mockConfig({
        comfyServerUrl: "http://comfy:8188",
        buttons: [{ id: buttonId, label: "Cartoon", workflowJson }],
      });

      const res = await request(app)
        .post("/api/ai/generate")
        .send({ photoId, buttonId });

      expect(res.status).toBe(500);
    });

    it("never fetches /api/frame/:id — only /api/photos/:id for raw image", async () => {
      const photoId = "frame-check.jpg";
      const buttonId = "cartoon";
      const comfyUrl = "http://comfy:8188";
      const workflowJson = JSON.stringify({
        "1": { class_type: "LoadImage", inputs: { image: "placeholder.jpg" } },
      });

      const fetchCalls: string[] = [];
      const sharp = (await import("sharp")).default;
      const validJpeg = await sharp({
        create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 255, b: 0 } },
      }).jpeg().toBuffer();

      vi.spyOn(global, "fetch").mockImplementation(async (url: string | URL | Request) => {
        const urlString = url.toString();
        fetchCalls.push(urlString);
        if (urlString.includes("/api/photos/")) {
          return new Response(validJpeg, { status: 200, headers: { "content-type": "image/jpeg" } });
        }
        if (urlString.includes("/upload/image")) {
          return new Response(JSON.stringify({ filename: "uploaded.jpg", subfolder: "", type: "input" }), {
            status: 200, headers: { "content-type": "application/json" },
          });
        }
        if (urlString.includes("/prompt")) {
          return new Response(JSON.stringify({ prompt_id: "p1" }), {
            status: 200, headers: { "content-type": "application/json" },
          });
        }
        if (urlString.includes("/history/")) {
          return new Response(JSON.stringify({
            p1: { outputs: { "1": { images: [{ filename: "out.jpg", subfolder: "", type: "output" }] } } },
          }), { status: 200, headers: { "content-type": "application/json" } });
        }
        if (urlString.includes("/view")) {
          return new Response(validJpeg, { status: 200, headers: { "content-type": "image/jpeg" } });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      });

      mockConfig({
        comfyServerUrl: comfyUrl,
        buttons: [{ id: buttonId, label: "Cartoon", workflowJson }],
      });

      const res = await request(app)
        .post("/api/ai/generate")
        .send({ photoId, buttonId });

      expect(res.status).toBe(200);
      expect(fetchCalls.some((u) => u.includes("/api/photos/frame-check.jpg"))).toBe(true);
      expect(fetchCalls.every((u) => !u.includes("/api/frame/"))).toBe(true);
    });

    it("applies event frame to the AI-generated result", async () => {
      const photoId = "gen-frame.jpg";
      const buttonId = "cartoon";
      const comfyUrl = "http://comfy:8188";
      const workflowJson = JSON.stringify({
        "1": { class_type: "LoadImage", inputs: { image: "placeholder.jpg" } },
      });

      const sharp = (await import("sharp")).default;
      const validJpeg = await sharp({
        create: { width: 200, height: 200, channels: 3, background: { r: 128, g: 128, b: 128 } },
      }).jpeg().toBuffer();

      vi.spyOn(global, "fetch").mockImplementation(async (url: string | URL | Request) => {
        const urlString = url.toString();
        if (urlString.includes("/api/photos/")) {
          return new Response(validJpeg, { status: 200, headers: { "content-type": "image/jpeg" } });
        }
        if (urlString.includes("/upload/image")) {
          return new Response(JSON.stringify({ filename: "uploaded.jpg", subfolder: "", type: "input" }), {
            status: 200, headers: { "content-type": "application/json" },
          });
        }
        if (urlString.includes("/prompt")) {
          return new Response(JSON.stringify({ prompt_id: "p2" }), {
            status: 200, headers: { "content-type": "application/json" },
          });
        }
        if (urlString.includes("/history/")) {
          return new Response(JSON.stringify({
            p2: { outputs: { "1": { images: [{ filename: "out.jpg", subfolder: "", type: "output" }] } } },
          }), { status: 200, headers: { "content-type": "application/json" } });
        }
        if (urlString.includes("/view")) {
          return new Response(validJpeg, { status: 200, headers: { "content-type": "image/jpeg" } });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      });

      mockConfig({
        comfyServerUrl: comfyUrl,
        buttons: [{ id: buttonId, label: "Cartoon", workflowJson }],
      });

      const res = await request(app)
        .post("/api/ai/generate")
        .send({ photoId, buttonId });

      expect(res.status).toBe(200);
      expect(res.body.imageUrl).toMatch(/^data:image\/jpeg;base64,/);

      const resultBuffer = Buffer.from(
        res.body.imageUrl.replace(/^data:image\/jpeg;base64,/, ""),
        "base64"
      );
      const resultMeta = await sharp(resultBuffer).metadata();
      expect(resultMeta.width).toBeGreaterThanOrEqual(800);
      expect(resultMeta.height!).toBeGreaterThan(200);
    });
  });
});
