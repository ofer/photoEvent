import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../index";
import fs from "fs";
import path from "path";
import sharp from "sharp";

const STORAGE_DIR = path.resolve(__dirname, "../../storage");
const CONFIG_DIR = path.resolve(__dirname, "../../storage/config");
const CONFIG_PATH = path.join(CONFIG_DIR, "settings.json");

describe("GET /api/frame/:id — EXIF orientation handling", () => {
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

  describe("framed image dimensions respect EXIF orientation", () => {
    it("uses EXIF-corrected dimensions when photo has orientation=6 (common portrait phone photo)", async () => {
      // Create a JPEG with EXIF orientation=6
      // This simulates a phone photo taken in portrait but stored with
      // landscape pixel dimensions (e.g. 200×100 raw pixels)
      const pixels = Buffer.alloc(200 * 100 * 3);
      for (let i = 0; i < pixels.length; i++) {
        pixels[i] = (i * 7 + 50) % 256; // red channel pattern
        pixels[i + 1] = (i * 11 + 20) % 256; // green channel pattern
        pixels[i + 2] = (i * 13 + 100) % 256; // blue channel pattern
      }

      const testImage = await sharp(pixels, {
        raw: { width: 200, height: 100, channels: 3 },
      })
        .withMetadata({ orientation: 6 })
        .jpeg({ quality: 90 })
        .toBuffer();

      // Verify the uploaded image has orientation=6 in its EXIF
      const uploadMeta = await sharp(testImage).metadata();
      expect(uploadMeta.orientation).toBe(6);
      // Raw pixel dimensions are landscape
      expect(uploadMeta.width).toBe(200);
      expect(uploadMeta.height).toBe(100);

      // Upload via the photo API
      const uploadRes = await request(app)
        .post("/api/photos")
        .attach("photo", testImage, "portrait-exif.jpg");
      const filename = uploadRes.body.id;

      // Configure proportional frame for predictable dimensions
      await request(app).put("/api/config").send({
        event: { name: "Test", year: "2026" },
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

      // Request framed image
      const frameRes = await request(app).get(`/api/frame/${filename}`);
      expect(frameRes.status).toBe(200);

      // After rotation, the image should be portrait (100×200)
      // Frame should use portrait dimensions:
      //   padding = 5% of 100 = 5px
      //   barHeight = 15% of 200 = 30px
      //   frameH = 200 + 30 + 5*2 = 240
      //   frameW = 100
      // The framed image width should be ~100 (portrait frame), NOT ~200 (landscape frame)
      const frameMeta = await sharp(frameRes.body).metadata();
      const framedHeight = await sharp(frameRes.body)
        .raw()
        .toBuffer({ resolveWithObject: true })
        .then((r) => r.info.height);

      // The framed image should be portrait-tall, not landscape-wide
      // If EXIF is ignored, width=200, height=135 (200 + 15 + 5*2) — wrong
      // If EXIF is applied, width=100, height=240 (100 + 30 + 5*2) — correct
      expect(framedHeight).toBe(240);
      expect(frameMeta.width).toBe(100);

      // The bar region (bottom 30px) should have the dark bar color
      const { data, info } = await sharp(frameRes.body)
        .raw()
        .toBuffer({ resolveWithObject: true });
      const barTop = 200 + 5; // imageHeight + padding
      const barHeight = 30;

      let darkCount = 0;
      for (let y = barTop; y < barTop + barHeight; y += 1) {
        for (let x = 0; x < info.width; x += 4) {
          const offset = (y * info.width + x) * info.channels;
          const r = data[offset];
          const g = data[offset + 1];
          const b = data[offset + 2];
          if (r < 50 && g < 50 && b < 50) {
            darkCount++;
          }
        }
      }
      expect(darkCount).toBeGreaterThan(100);
    });

    it("handles orientation=8 (common counter-clockwise portrait)", async () => {
      // orientation=8 = 90° counter-clockwise rotation
      const pixels = Buffer.alloc(200 * 100 * 3);
      for (let i = 0; i < pixels.length; i++) {
        pixels[i] = (i * 3 + 10) % 256;
        pixels[i + 1] = (i * 5 + 30) % 256;
        pixels[i + 2] = (i * 7 + 60) % 256;
      }

      const testImage = await sharp(pixels, {
        raw: { width: 200, height: 100, channels: 3 },
      })
        .withMetadata({ orientation: 8 })
        .jpeg({ quality: 90 })
        .toBuffer();

      const uploadMeta = await sharp(testImage).metadata();
      expect(uploadMeta.orientation).toBe(8);

      const uploadRes = await request(app)
        .post("/api/photos")
        .attach("photo", testImage, "portrait-exif-8.jpg");
      const filename = uploadRes.body.id;

      await request(app).put("/api/config").send({
        event: { name: "Test", year: "2026" },
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

      const frameRes = await request(app).get(`/api/frame/${filename}`);
      expect(frameRes.status).toBe(200);

      const frameMeta = await sharp(frameRes.body).metadata();
      const framedHeight = await sharp(frameRes.body)
        .raw()
        .toBuffer({ resolveWithObject: true })
        .then((r) => r.info.height);

      // orientation=8 also rotates 90°, so dimensions become 100×200
      expect(framedHeight).toBe(240);
      expect(frameMeta.width).toBe(100);
    });

    it("does not rotate images without EXIF orientation (orientation=1)", async () => {
      // Create a portrait image with no EXIF orientation (orientation=1 = normal)
      const pixels = Buffer.alloc(100 * 200 * 3);
      for (let i = 0; i < pixels.length; i++) {
        pixels[i] = (i * 7 + 50) % 256;
        pixels[i + 1] = (i * 11 + 20) % 256;
        pixels[i + 2] = (i * 13 + 100) % 256;
      }

      const testImage = await sharp(pixels, {
        raw: { width: 100, height: 200, channels: 3 },
      })
        .jpeg({ quality: 90 })
        .toBuffer();

      const uploadMeta = await sharp(testImage).metadata();
      // No orientation tag or orientation=1 (normal)
      expect([undefined, null, 1]).toContain(uploadMeta.orientation);

      const uploadRes = await request(app)
        .post("/api/photos")
        .attach("photo", testImage, "no-exif-portrait.jpg");
      const filename = uploadRes.body.id;

      await request(app).put("/api/config").send({
        event: { name: "Test", year: "2026" },
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

      const frameRes = await request(app).get(`/api/frame/${filename}`);
      expect(frameRes.status).toBe(200);

      const frameMeta = await sharp(frameRes.body).metadata();
      const framedHeight = await sharp(frameRes.body)
        .raw()
        .toBuffer({ resolveWithObject: true })
        .then((r) => r.info.height);

      // No rotation needed: width=100, height=200
      // padding=5% of 100=5, barHeight=15% of 200=30, frameH=200+30+5*2=240
      // Code uses imgW for padding, imgH for barHeight
      expect(framedHeight).toBe(240);
      expect(frameMeta.width).toBe(100);
    });

    it("handles landscape image with orientation=1 (no rotation needed)", async () => {
      const pixels = Buffer.alloc(200 * 100 * 3);
      for (let i = 0; i < pixels.length; i++) {
        pixels[i] = (i * 7 + 50) % 256;
        pixels[i + 1] = (i * 11 + 20) % 256;
        pixels[i + 2] = (i * 13 + 100) % 256;
      }

      const testImage = await sharp(pixels, {
        raw: { width: 200, height: 100, channels: 3 },
      })
        .jpeg({ quality: 90 })
        .toBuffer();

      const uploadRes = await request(app)
        .post("/api/photos")
        .attach("photo", testImage, "landscape-normal.jpg");
      const filename = uploadRes.body.id;

      await request(app).put("/api/config").send({
        event: { name: "Test", year: "2026" },
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

      const frameRes = await request(app).get(`/api/frame/${filename}`);
      expect(frameRes.status).toBe(200);

      const frameMeta = await sharp(frameRes.body).metadata();
      const framedHeight = await sharp(frameRes.body)
        .raw()
        .toBuffer({ resolveWithObject: true })
        .then((r) => r.info.height);

      // No rotation needed: width=200, height=100
      // padding=5% of 200=10, barHeight=15% of 100=15, frameH=100+15+10*2=135
      expect(framedHeight).toBe(135);
      expect(frameMeta.width).toBe(200);
    });
  });
});
