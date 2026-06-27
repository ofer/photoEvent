import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../index";
import fs from "fs";
import path from "path";

const CONFIG_DIR = path.resolve(__dirname, "../../storage/config");
const CONFIG_PATH = path.join(CONFIG_DIR, "settings.json");

function cleanConfig(): void {
  if (fs.existsSync(CONFIG_DIR)) {
    fs.rmSync(CONFIG_DIR, { recursive: true, force: true });
  }
}

describe("AI Route", () => {
  beforeAll(() => {
    cleanConfig();
  });

  afterAll(() => {
    cleanConfig();
  });

  beforeEach(() => {
    if (fs.existsSync(CONFIG_PATH)) {
      fs.unlinkSync(CONFIG_PATH);
    }
  });

  describe("POST /api/ai/generate", () => {
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
      await request(app).put("/api/config").send({
        ai: {
          comfyServerUrl: "http://test:8188",
          buttons: [{ id: "empty", label: "Empty", workflowJson: "" }],
        },
      });
      const res = await request(app).post("/api/ai/generate").send({ photoId: "test.jpg", buttonId: "empty" });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("not configured");
    });

    it("returns 400 when the selected button's workflow JSON is invalid", async () => {
      await request(app).put("/api/config").send({
        ai: {
          comfyServerUrl: "http://test:8188",
          buttons: [{ id: "bad", label: "Bad", workflowJson: "not json" }],
        },
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
});
