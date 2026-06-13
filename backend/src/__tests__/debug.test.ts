import { test, expect } from "vitest";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import request from "supertest";
import app from "../index";

// Use process.cwd() for storage — matches route handler when __dirname is "." (tsx)
const STORAGE_DIR = path.resolve(process.cwd(), "storage");

test("debug file timing", async () => {
  const pixels = Buffer.alloc(100 * 100 * 3);
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = 100 + (i % 155);
    pixels[i + 1] = 50 + (i % 200);
    pixels[i + 2] = 200 - (i % 100);
  }
  const testImage = await sharp(pixels, { raw: { width: 100, height: 100, channels: 3 } })
    .jpeg({ quality: 90 })
    .toBuffer();

  console.log("Before upload, files:", fs.readdirSync(STORAGE_DIR));

  const res = await request(app)
    .post("/api/photos")
    .attach("photo", testImage, "test.jpg");

  console.log("Upload status:", res.status);
  console.log("After upload, files:", fs.readdirSync(STORAGE_DIR));

  if (res.status === 201) {
    const filename = res.body.id;
    console.log("Photo ID:", filename);
    console.log("File exists:", fs.existsSync(path.join(STORAGE_DIR, filename)));

    const frameRes = await request(app).get("/api/frame/" + filename);
    console.log("Frame status:", frameRes.status);
    expect(frameRes.status).toBe(200);
  }

  // Cleanup
  fs.readdirSync(STORAGE_DIR).forEach((f) => fs.unlinkSync(path.join(STORAGE_DIR, f)));
  console.log("After cleanup, files:", fs.readdirSync(STORAGE_DIR));
});
