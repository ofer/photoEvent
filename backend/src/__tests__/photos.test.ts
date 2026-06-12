import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../index";
import fs from "fs";
import path from "path";

const STORAGE_DIR = path.resolve(__dirname, "../../storage");

describe("Photo API", () => {
  beforeEach(() => {
    // Clean storage before each test
    if (fs.existsSync(STORAGE_DIR)) {
      fs.readdirSync(STORAGE_DIR).forEach((file) => {
        fs.unlinkSync(path.join(STORAGE_DIR, file));
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
  });
});
