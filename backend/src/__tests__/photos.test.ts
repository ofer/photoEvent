import { describe, it, expect, beforeEach, afterAll } from "vitest";
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

  describe("GET /api/frame/:id — text centering in tall bar", () => {
    const CONFIG_DIR = path.resolve(__dirname, "../../storage/config");
    const CONFIG_PATH = path.join(CONFIG_DIR, "settings.json");

    beforeEach(() => {
      // Clean storage
      if (fs.existsSync(STORAGE_DIR)) {
        fs.readdirSync(STORAGE_DIR).forEach((file) => {
          const fullPath = path.join(STORAGE_DIR, file);
          if (fs.statSync(fullPath).isFile()) {
            fs.unlinkSync(fullPath);
          }
        });
      }
      // Clean config
      if (fs.existsSync(CONFIG_DIR)) {
        fs.rmSync(CONFIG_DIR, { recursive: true, force: true });
      }
    });

    afterAll(() => {
      if (fs.existsSync(CONFIG_DIR)) {
        fs.rmSync(CONFIG_DIR, { recursive: true, force: true });
      }
    });

    it("centers text vertically inside bar when barHeight=500 and fontSize=72", async () => {
      // Create a test image
      const pixels = Buffer.alloc(100 * 100 * 3);
      const testImage = await sharp(pixels, {
        raw: { width: 100, height: 100, channels: 3 },
      }).jpeg().toBuffer();

      const uploadRes = await request(app)
        .post("/api/photos")
        .attach("photo", testImage, "tall-bar.jpg");

      // Set extreme config: tall bar + large font
      await request(app).put("/api/config").send({
        event: { name: "Bar Mitzvah", year: "2026" },
        frame: {
          padding: 40,
          barHeight: 500,
          fontSize: 72,
          barColor: "#1e1e1e",
          barTextColor: "#ffffff",
          subtextColor: "#cccccc",
          backgroundColor: "#ffffff",
        },
        print: { paperSize: "A4", orientation: "landscape", margin: "10mm" },
      });

      // Request the framed image
      const frameRes = await request(app).get(`/api/frame/${uploadRes.body.id}`);
      expect(frameRes.status).toBe(200);

      // Verify total height: imgH + barHeight + 2*padding
      const meta = await sharp(frameRes.body).metadata();
      expect(meta.height).toBe(100 + 500 + 40 * 2); // 680

      const { data, info } = await sharp(frameRes.body)
        .raw()
        .toBuffer({ resolveWithObject: true });
      const barTop = 100 + 40;
      const barHeight = 500;
      const brightPixelCountsByRow: number[] = [];

      for (let y = barTop; y < barTop + barHeight; y += 1) {
        let brightPixels = 0;
        for (let x = 0; x < info.width; x += 1) {
          const offset = (y * info.width + x) * info.channels;
          const red = data[offset];
          const green = data[offset + 1];
          const blue = data[offset + 2];
          if (red > 150 && green > 150 && blue > 150) {
            brightPixels += 1;
          }
        }
        brightPixelCountsByRow.push(brightPixels);
      }

      const textRows = brightPixelCountsByRow
        .map((count, row) => ({ count, row }))
        .filter(({ count }) => count > 10)
        .map(({ row }) => row);
      const textTop = Math.min(...textRows);
      const textBottom = Math.max(...textRows);

      expect(textTop).toBeGreaterThan(150);
      expect(textBottom).toBeLessThan(350);
      expect(textBottom - textTop).toBeGreaterThanOrEqual(110);
    });

    it("centers text vertically inside bar when barHeight=150 and fontSize=50", async () => {
      const pixels = Buffer.alloc(100 * 100 * 3);
      const testImage = await sharp(pixels, {
        raw: { width: 100, height: 100, channels: 3 },
      }).jpeg().toBuffer();

      await request(app)
        .post("/api/photos")
        .attach("photo", testImage, "medium-bar.jpg");

      await request(app).put("/api/config").send({
        event: { name: "Test", year: "2025" },
        frame: {
          padding: 40,
          barHeight: 150,
          fontSize: 50,
          barColor: "#000000",
          barTextColor: "#ffffff",
          subtextColor: "#aaaaaa",
          backgroundColor: "#ffffff",
        },
        print: { paperSize: "A4", orientation: "landscape", margin: "10mm" },
      });

      const photos = await request(app).get("/api/photos");
      const frameRes = await request(app).get(`/api/frame/${photos.body[0].id}`);
      expect(frameRes.status).toBe(200);

      const meta = await sharp(frameRes.body).metadata();
      expect(meta.height).toBe(100 + 150 + 40 * 2); // 330
    });
  });
});
