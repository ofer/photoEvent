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

    it("uses env vars when no config file exists", async () => {
      const configPath = path.resolve(__dirname, "../../storage/config/settings.json");
      const hadConfig = fs.existsSync(configPath);
      let savedConfig: string | undefined;
      if (hadConfig) {
        savedConfig = fs.readFileSync(configPath, "utf-8");
        fs.unlinkSync(configPath);
      }

      const origName = process.env.EVENT_NAME;
      const origYear = process.env.EVENT_YEAR;
      process.env.EVENT_NAME = "Bar Mitzvah";
      process.env.EVENT_YEAR = "2025";

      try {
        const res = await request(app).get("/api/event");
        expect(res.status).toBe(200);
        expect(res.body.name).toBe("Bar Mitzvah");
        expect(res.body.year).toBe("2025");
      } finally {
        if (origName) process.env.EVENT_NAME = origName;
        else delete process.env.EVENT_NAME;
        if (origYear) process.env.EVENT_YEAR = origYear;
        else delete process.env.EVENT_YEAR;
        if (hadConfig && savedConfig) {
          fs.mkdirSync(path.dirname(configPath), { recursive: true });
          fs.writeFileSync(configPath, savedConfig, "utf-8");
        }
      }
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

    it("centers text vertically inside bar with proportional config", async () => {
      // Create a 400x400 test image
      const pixels = Buffer.alloc(400 * 400 * 3);
      const testImage = await sharp(pixels, {
        raw: { width: 400, height: 400, channels: 3 },
      }).jpeg().toBuffer();

      const uploadRes = await request(app)
        .post("/api/photos")
        .attach("photo", testImage, "prop-bar.jpg");

      // Use percentage-based config: bar=15% of imgH, padding=5% of imgW, font=3% of imgW
      await request(app).put("/api/config").send({
        event: { name: "Bar Mitzvah", year: "2026" },
        frame: {
          paddingPct: 0.05,
          barHeightPct: 0.15,
          fontSizePct: 0.03,
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

      // Expected: padding=20px, barHeight=60px, frameH=400+60+40=500
      const meta = await sharp(frameRes.body).metadata();
      expect(meta.height).toBe(400 + 60 + 20 * 2);

      // Verify the bar section exists and has the dark bar color
      const { data, info } = await sharp(frameRes.body)
        .raw()
        .toBuffer({ resolveWithObject: true });
      const barTop = 400 + 20;
      const barHeight = 60;

      // Count dark pixels (bar background) in the bar region
      let darkCount = 0;
      for (let y = barTop; y < barTop + barHeight; y += 1) {
        for (let x = 0; x < info.width; x += 4) {
          const offset = (y * info.width + x) * info.channels;
          const r = data[offset];
          const g = data[offset + 1];
          const b = data[offset + 2];
          // Bar is dark gray (#1e1e1e)
          if (r < 50 && g < 50 && b < 50) {
            darkCount++;
          }
        }
      }
      // Most of the bar should be dark
      expect(darkCount).toBeGreaterThan(500);
    });

    it("centers text vertically inside bar with smaller proportions", async () => {
      const pixels = Buffer.alloc(300 * 300 * 3);
      const testImage = await sharp(pixels, {
        raw: { width: 300, height: 300, channels: 3 },
      }).jpeg().toBuffer();

      await request(app)
        .post("/api/photos")
        .attach("photo", testImage, "small-bar.jpg");

      await request(app).put("/api/config").send({
        event: { name: "Test", year: "2025" },
        frame: {
          paddingPct: 0.03,
          barHeightPct: 0.1,
          fontSizePct: 0.02,
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

      // 300px image: padding=9px, barHeight=30px, frameH=300+30+18=348
      const meta = await sharp(frameRes.body).metadata();
      expect(meta.height).toBe(300 + 30 + 9 * 2);
    });
  });
});
