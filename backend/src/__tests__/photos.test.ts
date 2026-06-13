import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../index";
import fs from "fs";
import path from "path";
import sharp from "sharp";

const STORAGE_DIR = path.resolve(__dirname, "../../storage");

describe("Photo API", () => {
  beforeEach(() => {
    // Clean storage before each test
    if (fs.existsSync(STORAGE_DIR)) {
      fs.readdirSync(STORAGE_DIR).forEach((file) => {
        const fullPath = path.join(STORAGE_DIR, file);
        if (fs.statSync(fullPath).isFile()) {
          fs.unlinkSync(fullPath);
        }
      });
    }
  });

  describe("POST /api/photos", () => {
    it("rejects non-image files", async () => {
      const res = await request(app)
        .post("/api/photos")
        .attach("photo", Buffer.from("not an image"), "test.txt");
      expect(res.status).toBe(400);
    });

    it("returns 201 with photo metadata", async () => {
      const testImage = Buffer.alloc(1024 * 100, 0xff);
      // JPEG magic bytes
      testImage[0] = 0xff;
      testImage[1] = 0xd8;
      testImage[2] = 0xff;

      const res = await request(app)
        .post("/api/photos")
        .attach("photo", testImage, "test.jpg");
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body).toHaveProperty("url");
      expect(res.body).toHaveProperty("thumb");
      expect(res.body).toHaveProperty("timestamp");
    });
  });

  describe("GET /api/photos", () => {
    it("returns empty array when no photos", async () => {
      const res = await request(app).get("/api/photos");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns list of photos", async () => {
      const testImage = Buffer.alloc(1024 * 100, 0xff);
      testImage[0] = 0xff;
      testImage[1] = 0xd8;
      testImage[2] = 0xff;

      await request(app)
        .post("/api/photos")
        .attach("photo", testImage, "photo1.jpg");

      const res = await request(app).get("/api/photos");
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty("id");
      expect(res.body[0]).toHaveProperty("url");
    });
  });

  describe("GET /api/health", () => {
    it("returns 200 with status ok", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });
  });

  describe("GET /api/event", () => {
    it("returns event config", async () => {
      const res = await request(app).get("/api/event");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("name");
      expect(res.body).toHaveProperty("year");
    });

    it("uses env vars when set", async () => {
      const origName = process.env.EVENT_NAME;
      const origYear = process.env.EVENT_YEAR;
      process.env.EVENT_NAME = "Bar Mitzvah";
      process.env.EVENT_YEAR = "2025";

      const res = await request(app).get("/api/event");
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Bar Mitzvah");
      expect(res.body.year).toBe("2025");

      if (origName) process.env.EVENT_NAME = origName;
      else delete process.env.EVENT_NAME;
      if (origYear) process.env.EVENT_YEAR = origYear;
      else delete process.env.EVENT_YEAR;
    });
  });

  describe("GET /api/frame/:id", () => {
    it("returns 404 for missing photo", async () => {
      const res = await request(app).get("/api/frame/nonexistent.jpg");
      expect(res.status).toBe(404);
    });

    it("returns framed image for existing photo", async () => {
      // Generate a valid minimal JPEG using sharp pipeline
      const pixels = Buffer.alloc(100 * 100 * 3);
      for (let i = 0; i < pixels.length; i += 3) {
        pixels[i] = 255; // red
        pixels[i + 1] = 100;
        pixels[i + 2] = 100;
      }
      const testImage = await sharp(pixels, {
        raw: { width: 100, height: 100, channels: 3 },
      })
        .jpeg()
        .toBuffer();

      const uploadRes = await request(app)
        .post("/api/photos")
        .attach("photo", testImage, "frame-test.jpg");
      const filename = uploadRes.body.id;

      const frameRes = await request(app).get(`/api/frame/${filename}`);
      expect(frameRes.status).toBe(200);
      expect(frameRes.headers["content-type"]).toMatch(/image/);
    });
  });

  describe("GET /api/qr", () => {
    it("returns QR code as PNG", async () => {
      const res = await request(app).get("/api/qr");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("image/png");
      expect(res.body.length).toBeGreaterThan(0);
    });
  });
});
