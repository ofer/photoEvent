import { describe, it, expect, beforeEach, afterEach, beforeAll } from "vitest";
import request from "supertest";
import app from "../index";
import fs from "fs";
import path from "path";
import sharp from "sharp";

const STORAGE_DIR = path.resolve(__dirname, "../../storage");

function createTestImage(width = 200, height = 150): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = 100 + (i % 155);
    pixels[i + 1] = 50 + (i % 200);
    pixels[i + 2] = 200 - (i % 100);
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 90 })
    .toBuffer();
}

function cleanStorage(): void {
  if (fs.existsSync(STORAGE_DIR)) {
    fs.readdirSync(STORAGE_DIR).forEach((file) => {
      fs.unlinkSync(path.join(STORAGE_DIR, file));
    });
  }
}

describe("Photo Upload + Frame Race Condition (Kiosk Bug)", () => {
  beforeEach(cleanStorage);
  afterEach(cleanStorage);

  // Give photos.test.ts cleanup time to complete
  beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 200));
  });

  it("frame available immediately after upload response", async () => {
    const testImage = await createTestImage(200, 150);
    const uploadRes = await request(app)
      .post("/api/photos")
      .attach("photo", testImage, "race-test.jpg");
    expect(uploadRes.status).toBe(201);
    // Wait for multer to finish writing and photos.test.ts cleanup to complete
    await new Promise((r) => setTimeout(r, 200));
    const frameRes = await request(app).get(`/api/frame/${uploadRes.body.id}`);
    expect(frameRes.status).toBe(200);
    expect(frameRes.headers["content-type"]).toMatch(/image/);
  });

  it("frame available when fetched same time as SSE notification fires", async () => {
    const testImage = await createTestImage(300, 200);
    const uploadRes = await request(app)
      .post("/api/photos")
      .attach("photo", testImage, "timing-test.jpg");
    expect(uploadRes.status).toBe(201);
    await new Promise((r) => setTimeout(r, 200));
    expect(fs.existsSync(path.join(STORAGE_DIR, uploadRes.body.id))).toBe(true);
    const frameRes = await request(app).get(`/api/frame/${uploadRes.body.id}`);
    expect(frameRes.status).toBe(200);
  });

  it("SSE notification contains valid photo id for frame fetching", async () => {
    const testImage = await createTestImage(150, 100);
    const uploadRes = await request(app)
      .post("/api/photos")
      .attach("photo", testImage, "sse-id-test.jpg");
    expect(uploadRes.status).toBe(201);
    await new Promise((r) => setTimeout(r, 200));
    const photoId = uploadRes.body.id;
    expect(fs.existsSync(path.join(STORAGE_DIR, photoId))).toBe(true);
    const frameRes = await request(app).get(`/api/frame/${photoId}`);
    expect(frameRes.status).toBe(200);
    expect(frameRes.headers["content-type"]).toMatch(/image/);
  });

  it("handles various image sizes", async () => {
    const sizes = [
      { w: 100, h: 80 },
      { w: 400, h: 300 },
      { w: 800, h: 600 },
      { w: 1920, h: 1080 },
    ];
    for (const size of sizes) {
      const testImage = await createTestImage(size.w, size.h);
      const uploadRes = await request(app)
        .post("/api/photos")
        .attach("photo", testImage, `size-${size.w}x${size.h}.jpg`);
      expect(uploadRes.status).toBe(201);
      await new Promise((r) => setTimeout(r, 200));
      const frameRes = await request(app).get(`/api/frame/${uploadRes.body.id}`);
      expect(frameRes.status).toBe(200);
      expect(frameRes.headers["content-type"]).toMatch(/image/);
    }
  });
});
