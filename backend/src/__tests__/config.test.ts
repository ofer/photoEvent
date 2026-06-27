import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
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

describe("Config API", () => {
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

  describe("GET /api/config", () => {
    it("returns default config when no config file exists", async () => {
      const res = await request(app).get("/api/config");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("event");
      expect(res.body).toHaveProperty("frame");
      expect(res.body).toHaveProperty("print");
      expect(res.body.event).toHaveProperty("name");
      expect(res.body.event).toHaveProperty("year");
    });

    it("returns persisted config after PUT", async () => {
      // First save
      await request(app).put("/api/config").send({
        event: { name: "Sarah's Bat Mitzvah", year: "2026" },
        frame: {
          padding: 60,
          barHeight: 120,
          fontSize: 44,
          barColor: "#2d2d2d",
          barTextColor: "#ffffff",
          subtextColor: "#bbbbbb",
          backgroundColor: "#f0f0f0",
        },
        print: { paperSize: "10x15cm", orientation: "landscape", margin: "5mm" },
      });

      // Verify it persists
      const res = await request(app).get("/api/config");
      expect(res.status).toBe(200);
      expect(res.body.event.name).toBe("Sarah's Bat Mitzvah");
      expect(res.body.event.year).toBe("2026");
      expect(res.body.frame.padding).toBe(60);
      expect(res.body.frame.barHeight).toBe(120);
      expect(res.body.frame.fontSize).toBe(44);
      expect(res.body.frame.barColor).toBe("#2d2d2d");
      expect(res.body.frame.barTextColor).toBe("#ffffff");
      expect(res.body.frame.subtextColor).toBe("#bbbbbb");
      expect(res.body.frame.backgroundColor).toBe("#f0f0f0");
      expect(res.body.print.paperSize).toBe("10x15cm");
      expect(res.body.print.orientation).toBe("landscape");
      expect(res.body.print.margin).toBe("5mm");
    });

    it("merges partial updates with defaults", async () => {
      // Save only event name
      await request(app).put("/api/config").send({
        event: { name: "Jonah's Bar Mitzvah" },
      });

      const res = await request(app).get("/api/config");
      expect(res.status).toBe(200);
      expect(res.body.event.name).toBe("Jonah's Bar Mitzvah");
      // Year should fall back to env or default
      expect(res.body.event.year).toBeDefined();

      // Frame should use defaults
      expect(res.body.frame.padding).toBe(40);
      expect(res.body.frame.barHeight).toBe(100);
      expect(res.body.frame.fontSize).toBe(36);
      expect(res.body.frame.barColor).toBe("#1e1e1e");
      expect(res.body.frame.barTextColor).toBe("#ffffff");
      expect(res.body.frame.subtextColor).toBe("#cccccc");
      expect(res.body.frame.backgroundColor).toBe("#ffffff");

      // Print should use defaults
      expect(res.body.print.paperSize).toBe("A4");
      expect(res.body.print.orientation).toBe("landscape");
      expect(res.body.print.margin).toBe("10mm");
    });

    it("preserves unchanged sections on partial update", async () => {
      // First save full config
      await request(app).put("/api/config").send({
        event: { name: "Original", year: "2024" },
        frame: {
          padding: 80,
          barHeight: 150,
          fontSize: 50,
          barColor: "#000000",
          barTextColor: "#fff",
          subtextColor: "#ccc",
          backgroundColor: "#fff",
        },
        print: { paperSize: "8x10in", orientation: "portrait", margin: "15mm" },
      });

      // Now update only event
      await request(app).put("/api/config").send({
        event: { name: "Updated Event" },
      });

      const res = await request(app).get("/api/config");
      expect(res.body.event.name).toBe("Updated Event");
      // Frame should still have previous values
      expect(res.body.frame.padding).toBe(80);
      expect(res.body.frame.barHeight).toBe(150);
      expect(res.body.frame.fontSize).toBe(50);
      expect(res.body.frame.barColor).toBe("#000000");
      // Print should still have previous values
      expect(res.body.print.paperSize).toBe("8x10in");
      expect(res.body.print.orientation).toBe("portrait");
      expect(res.body.print.margin).toBe("15mm");
    });
  });

  describe("PUT /api/config", () => {
    it("rejects empty body by preserving defaults", async () => {
      const res = await request(app).put("/api/config").send({});
      expect(res.status).toBe(200);
      expect(res.body.event).toBeDefined();
      expect(res.body.frame).toBeDefined();
      expect(res.body.print).toBeDefined();
      expect(res.body.frame.padding).toBe(40);
    });

    it("handles empty strings for event name and year", async () => {
      const res = await request(app).put("/api/config").send({
        event: { name: "", year: "" },
      });
      expect(res.status).toBe(200);
      expect(res.body.event.name).toBe("");
      expect(res.body.event.year).toBe("");
    });

    it("persists to storage/config.json on disk", async () => {
      await request(app).put("/api/config").send({
        event: { name: "Disk Test", year: "2027" },
      });

      expect(fs.existsSync(CONFIG_PATH)).toBe(true);
      const diskConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
      expect(diskConfig.event.name).toBe("Disk Test");
      expect(diskConfig.event.year).toBe("2027");
    });
  });

  describe("mergeWithDefaults behavior", () => {
    it("handles undefined sections gracefully", async () => {
      const res = await request(app).put("/api/config").send({
        event: undefined,
        frame: { padding: 10 },
        print: { margin: "2mm" },
      });
      expect(res.status).toBe(200);
      // event should use defaults
      expect(res.body.event).toHaveProperty("name");
      expect(res.body.event).toHaveProperty("year");
      // frame should have merged padding
      expect(res.body.frame.padding).toBe(10);
      expect(res.body.frame.barHeight).toBe(100); // default
      // print should have merged margin
      expect(res.body.print.margin).toBe("2mm");
      expect(res.body.print.paperSize).toBe("A4"); // default
    });

    it("rejects invalid frame dimensions while preserving valid values", async () => {
      await request(app).put("/api/config").send({
        frame: {
          padding: 40,
          barHeight: 500,
          fontSize: 72,
        },
      });

      const res = await request(app).put("/api/config").send({
        frame: {
          padding: -1,
          barHeight: 1,
          fontSize: 1,
        },
      });

      expect(res.status).toBe(200);
      expect(res.body.frame.padding).toBe(40);
      expect(res.body.frame.barHeight).toBe(500);
      expect(res.body.frame.fontSize).toBe(72);
    });

    it("returns all required fields for any config", async () => {
      const res = await request(app).put("/api/config").send({
        event: { name: "Full Test", year: "3000" },
        frame: {
          padding: 40,
          barHeight: 500,
          fontSize: 72,
          barColor: "#000000",
          barTextColor: "#ffffff",
          subtextColor: "#000000",
          backgroundColor: "#ffffff",
        },
        print: { paperSize: "5x7in", orientation: "portrait", margin: "1mm" },
      });
      expect(res.status).toBe(200);

      // Verify all required fields present
      const required = ["event", "frame", "print"];
      for (const key of required) {
        expect(res.body).toHaveProperty(key);
      }

      expect(res.body.event).toHaveProperty("name");
      expect(res.body.event).toHaveProperty("year");
      expect(res.body.frame).toHaveProperty("padding");
      expect(res.body.frame).toHaveProperty("barHeight");
      expect(res.body.frame).toHaveProperty("fontSize");
      expect(res.body.frame).toHaveProperty("barColor");
      expect(res.body.frame).toHaveProperty("barTextColor");
      expect(res.body.frame).toHaveProperty("subtextColor");
      expect(res.body.frame).toHaveProperty("backgroundColor");
      expect(res.body.print).toHaveProperty("paperSize");
      expect(res.body.print).toHaveProperty("orientation");
      expect(res.body.print).toHaveProperty("margin");
    });
  });
});

describe("Event API reads from config", () => {
  beforeAll(() => {
    cleanConfig();
  });

  afterAll(() => {
    cleanConfig();
    delete process.env.EVENT_NAME;
    delete process.env.EVENT_YEAR;
  });

  beforeEach(() => {
    if (fs.existsSync(CONFIG_PATH)) {
      fs.unlinkSync(CONFIG_PATH);
    }
  });

  it("returns default event values before any config is set", async () => {
    const res = await request(app).get("/api/event");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("name");
    expect(res.body).toHaveProperty("year");
  });

  it("returns configured event values after PUT", async () => {
    await request(app).put("/api/config").send({
      event: { name: "Configured Event", year: "2028" },
    });

    const res = await request(app).get("/api/event");
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Configured Event");
    expect(res.body.year).toBe("2028");
  });

  it("falls back to env vars when no config file exists", async () => {
    process.env.EVENT_NAME = "Env Event";
    process.env.EVENT_YEAR = "2029";

    const res = await request(app).get("/api/event");
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Env Event");
    expect(res.body.year).toBe("2029");

    delete process.env.EVENT_NAME;
    delete process.env.EVENT_YEAR;
  });
});

describe("AI config section", () => {
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

  it("returns default AI config with empty buttons array when no config file exists", async () => {
    const res = await request(app).get("/api/config");
    expect(res.status).toBe(200);
    expect(res.body.ai).toBeDefined();
    expect(res.body.ai.comfyServerUrl).toBe("http://10.0.0.17:8188");
    expect(Array.isArray(res.body.ai.buttons)).toBe(true);
    expect(res.body.ai.buttons).toEqual([]);
  });

  it("persists and returns AI config with buttons", async () => {
    await request(app).put("/api/config").send({
      ai: {
        comfyServerUrl: "http://my-comfy:8188",
        buttons: [
          { id: "cartoon", label: "Cartoon Caricature", workflowJson: '{"1":{"class_type":"LoadImage"}}' },
          { id: "tropical", label: "Tropical Island", workflowJson: '{"1":{"class_type":"LoadImage"}}' },
        ],
      },
    });

    const res = await request(app).get("/api/config");
    expect(res.body.ai.comfyServerUrl).toBe("http://my-comfy:8188");
    expect(res.body.ai.buttons).toHaveLength(2);
    expect(res.body.ai.buttons[0].id).toBe("cartoon");
    expect(res.body.ai.buttons[0].label).toBe("Cartoon Caricature");
    expect(res.body.ai.buttons[1].id).toBe("tropical");
    expect(JSON.parse(res.body.ai.buttons[0].workflowJson)["1"].class_type).toBe("LoadImage");
  });

  it("preserves existing AI config on partial update to other sections", async () => {
    await request(app).put("/api/config").send({
      ai: {
        comfyServerUrl: "http://my-comfy:8188",
        buttons: [
          { id: "cartoon", label: "Cartoon", workflowJson: '{"1":{}}' },
        ],
      },
    });

    await request(app).put("/api/config").send({
      event: { name: "New Name" },
    });

    const res = await request(app).get("/api/config");
    expect(res.body.ai.comfyServerUrl).toBe("http://my-comfy:8188");
    expect(res.body.ai.buttons).toHaveLength(1);
    expect(res.body.ai.buttons[0].id).toBe("cartoon");
    expect(res.body.event.name).toBe("New Name");
  });

  it("preserves existing buttons on partial ai update", async () => {
    await request(app).put("/api/config").send({
      ai: {
        comfyServerUrl: "http://first:8188",
        buttons: [
          { id: "a", label: "A", workflowJson: '{"a":1}' },
          { id: "b", label: "B", workflowJson: '{"b":2}' },
        ],
      },
    });

    // Update only the server URL — buttons should persist
    await request(app).put("/api/config").send({
      ai: { comfyServerUrl: "http://second:8188" },
    });

    const res = await request(app).get("/api/config");
    expect(res.body.ai.comfyServerUrl).toBe("http://second:8188");
    expect(res.body.ai.buttons).toHaveLength(2);
    expect(res.body.ai.buttons[0].id).toBe("a");
    expect(res.body.ai.buttons[1].id).toBe("b");
  });

  it("handles empty buttons array in PUT", async () => {
    await request(app).put("/api/config").send({
      ai: {
        comfyServerUrl: "http://test:8188",
        buttons: [{ id: "keep", label: "Keep", workflowJson: '{}' }],
      },
    });

    // Explicit empty array should clear buttons
    await request(app).put("/api/config").send({
      ai: { buttons: [] },
    });

    const res = await request(app).get("/api/config");
    expect(res.body.ai.buttons).toEqual([]);
    // Server URL should fall back to default since it wasn't sent
    expect(res.body.ai.comfyServerUrl).toBe("http://10.0.0.17:8188");
  });

  it("handles undefined ai section", async () => {
    await request(app).put("/api/config").send({
      event: { name: "Test" },
    });

    const res = await request(app).get("/api/config");
    expect(res.body.ai).toBeDefined();
    expect(res.body.ai.comfyServerUrl).toBe("http://10.0.0.17:8188");
    expect(res.body.ai.buttons).toEqual([]);
  });

  it("preserves button IDs for API route selection", async () => {
    await request(app).put("/api/config").send({
      ai: {
        comfyServerUrl: "http://test:8188",
        buttons: [
          { id: "cartoon", label: "Cartoon", workflowJson: '{"1":{}}' },
        ],
      },
    });

    const res = await request(app).get("/api/config");
    expect(res.body.ai.buttons[0].id).toBe("cartoon");
  });
});
