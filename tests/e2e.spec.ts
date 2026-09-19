import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const FIXTURES_DIR = path.join(__dirname, "fixtures");

const DEFAULT_CONFIG = {
  event: { name: "PhotoEvent", year: "2026" },
  frame: {
    paddingPct: 0.025,
    barHeightPct: 0.1,
    fontSizePct: 0.0225,
    barColor: "#1e1e1e",
    barTextColor: "#ffffff",
    subtextColor: "#cccccc",
    backgroundColor: "#ffffff",
  },
  print: { paperSize: "A4", orientation: "landscape", margin: "10mm" },
  ai: { comfyServerUrl: "http://10.0.0.17:8188", buttons: [] },
};

async function resetConfig(
  request: import("@playwright/test").APIRequestContext
) {
  const response = await request.put("/api/config", { data: DEFAULT_CONFIG });
  expect(response.status()).toBe(200);
}

/**
 * Wait until React has hydrated the client component and attached its event
 * handlers. `setInputFiles` dispatches a native `change` event; if it fires
 * before hydration, React hasn't subscribed yet and the event is silently
 * dropped (the review screen never appears). Polling for the React fiber
 * property on the element is a deterministic, fast hydration signal.
 */
async function waitForReactReady(page: import("@playwright/test").Page, selector: string) {
  await page.waitForFunction(
    (sel: string) => {
      const el = document.querySelector(sel);
      return (
        !!el &&
        Object.keys(el).some((k) =>
          k.startsWith("__reactFiber$") || k.startsWith("__reactContainer$")
        )
      );
    },
    selector,
    { timeout: 10_000 }
  );
}

test.describe("Photo Upload Flow", () => {
  test("capture page shows camera button", async ({ page }) => {
    await page.goto("/capture", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("button", { name: "Take a photo" })
    ).toBeVisible();

    await expect(page.locator("text=Uploading")).not.toBeVisible();
    await expect(page.locator("text=Photo sent to kiosk")).not.toBeVisible();
  });

  test("capture → preview → accept → photo in gallery and kiosk queue", async ({
    page,
    context,
  }) => {
    const testImagePath = path.join(FIXTURES_DIR, "e2e-test.jpg");
    const jpegData = fs.readFileSync(testImagePath);

    // Watch the kiosk before the capture happens
    const kiosk = await context.newPage();
    await kiosk.goto("/kiosk", { waitUntil: "domcontentloaded" });
    await expect(kiosk.locator("text=Waiting for photos")).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/capture", { waitUntil: "domcontentloaded" });
    await waitForReactReady(
      page,
      'input[type="file"][capture="environment"]'
    );

    let photoUploads = 0;
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/photos")) {
        photoUploads += 1;
      }
    });

    const input = page.locator('input[type="file"][capture="environment"]');
    await input.setInputFiles({
      name: "e2e-capture.jpg",
      mimeType: "image/jpeg",
      buffer: jpegData,
    });

    // Full-screen preview of exactly that photo appears
    await expect(page.locator("img[alt='Photo preview']")).toBeVisible({
      timeout: 10_000,
    });

    // Nothing was uploaded before Accept
    expect(photoUploads).toBe(0);
    await expect(kiosk.locator("button:has-text('Discard')")).not.toBeVisible();

    // Accept uploads it and shows success
    await page.locator("button:has-text('Accept')").click();
    await expect(page.locator("text=Photo sent to kiosk")).toBeVisible({
      timeout: 15_000,
    });
    expect(photoUploads).toBe(1);

    // Photo enters the kiosk queue with a countdown
    await expect(kiosk.locator("button:has-text('Discard')")).toBeVisible({
      timeout: 15_000,
    });
    await expect(kiosk.locator(".kiosk-print-area img")).toBeVisible({
      timeout: 15_000,
    });

    // Capture page returns to idle after ~3s
    await expect(page.locator("text=Photo sent to kiosk")).toBeHidden({
      timeout: 15_000,
    });

    // And the photo is in the gallery
    await page.goto("/gallery", { waitUntil: "domcontentloaded" });
    await expect(page.locator("img[src*='thumb_']").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("non-image upload fails with a user-friendly error and offers retry", async ({
    page,
  }) => {
    await page.goto("/capture", { waitUntil: "domcontentloaded" });
    await waitForReactReady(
      page,
      'input[type="file"][capture="environment"]'
    );

    const input = page.locator('input[type="file"][capture="environment"]');
    await input.setInputFiles({
      name: "not-an-image.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not an image"),
    });

    await expect(page.locator("img[alt='Photo preview']")).toBeVisible({
      timeout: 10_000,
    });

    await page.locator("button:has-text('Accept')").click();

    const errorText = page.locator("text=Only image files are allowed");
    await expect(errorText).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("button:has-text('Retry')")).toBeVisible();
    await expect(page.locator("button:has-text('Discard')")).toBeVisible();
  });

  test("rejects oversized upload", async ({ request }) => {
    const bigBuffer = Buffer.alloc(21 * 1024 * 1024, 0);
    bigBuffer[0] = 0xff;
    bigBuffer[1] = 0xd8;
    bigBuffer[2] = 0xff;

    const uploadResponse = await request.post("/api/photos", {
      multipart: {
        photo: {
          name: "too-big.jpg",
          mimeType: "image/jpeg",
          buffer: bigBuffer,
        },
      },
    });

    expect([413, 500]).toContain(uploadResponse.status());
  });
});

test.describe("Gallery Flow", () => {
  test("gallery shows photos in grid", async ({ page, request }) => {
    const testImagePath = path.join(FIXTURES_DIR, "e2e-test.jpg");
    const jpegData = fs.readFileSync(testImagePath);

    await request.post("/api/photos", {
      multipart: {
        photo: {
          name: "gallery-test.jpg",
          mimeType: "image/jpeg",
          buffer: jpegData,
        },
      },
    });

    await page.goto("/gallery", { waitUntil: "domcontentloaded" });

    await page.waitForTimeout(1500);

    const thumbnails = page.locator("img[src*='thumb_']");
    await expect(thumbnails.first()).toBeVisible();

    const photoButton = thumbnails.first().locator("..");
    await expect(photoButton).toHaveAttribute("aria-label", /^View .+\.jpg$/);
  });

  test("gallery shows empty state with no photos", async ({ page }) => {
    await page.goto("/gallery", { waitUntil: "domcontentloaded" });

    await page.waitForTimeout(2000);

    await expect(page.locator("main")).toBeVisible();
  });

  test("gallery loads event name from config", async ({ page, request }) => {
    await resetConfig(request);
    await page.goto("/gallery", { waitUntil: "domcontentloaded" });

    await expect(page.locator("text=PhotoEvent")).toBeVisible({
      timeout: 5000,
    });
  });

  test("gallery auto-refreshes via SSE", async ({ page, request }) => {
    await page.goto("/gallery", { waitUntil: "domcontentloaded" });

    const initialPhotos = page.locator("img[src*='thumb_']");
    const initialCount = await initialPhotos.count();

    const testImagePath = path.join(FIXTURES_DIR, "e2e-test.jpg");
    const jpegData = fs.readFileSync(testImagePath);

    await request.post("/api/photos", {
      multipart: {
        photo: {
          name: `sse-test-${Date.now()}.jpg`,
          mimeType: "image/jpeg",
          buffer: jpegData,
        },
      },
    });

    await page.waitForTimeout(3000);

    const finalCount = await initialPhotos.count();
    expect(finalCount).toBeGreaterThanOrEqual(initialCount);
  });
});

test.describe("QR Code Page", () => {
  test("qr page displays QR code", async ({ page, request }) => {
    await resetConfig(request);
    await page.goto("/qr", { waitUntil: "domcontentloaded" });

    const qrImage = page.locator("img[alt='Scan to capture photos']");
    await expect(qrImage).toBeVisible({ timeout: 10_000 });

    await expect(page.locator("text=PhotoEvent")).toBeVisible({
      timeout: 5000,
    });

    await expect(page.locator("text=Scan to take a photo")).toBeVisible({
      timeout: 5000,
    });
  });

  test("qr page shows error if backend is unreachable", async ({ page }) => {
    await page.goto("/qr", { waitUntil: "domcontentloaded" });

    await expect(page.locator("text=PhotoEvent")).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe("Kiosk Mode", () => {
  test("kiosk displays photo with frame after upload", async ({ page, request }) => {
    await page.goto("/kiosk", { waitUntil: "domcontentloaded" });

    await expect(page.locator("text=Waiting for photos")).toBeVisible({
      timeout: 5000,
    });

    await page.waitForTimeout(2000);

    const testImagePath = path.join(FIXTURES_DIR, "e2e-test.jpg");
    const jpegData = fs.readFileSync(testImagePath);

    const uploadResponse = await request.post("/api/photos", {
      multipart: {
        photo: {
          name: "kiosk-test.jpg",
          mimeType: "image/jpeg",
          buffer: jpegData,
        },
      },
    });

    expect(uploadResponse.ok()).toBe(true);

    await expect(
      page.locator("button:has-text('Discard')")
    ).toBeVisible({ timeout: 10_000 });

    const framedImage = page.locator(".kiosk-print-area img");
    await expect(framedImage).toBeVisible({ timeout: 5000 });

    const imageInfo = await page.evaluate(() => {
      const img = document.querySelector<HTMLImageElement>(
        ".kiosk-print-area img"
      );
      if (!img) return null;
      return {
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        complete: img.complete,
      };
    });

    expect(imageInfo).not.toBeNull();
    expect(imageInfo!.naturalWidth).toBeGreaterThan(0);
    expect(imageInfo!.complete).toBe(true);
  });

  test("kiosk countdown timer is visible", async ({ page, request }) => {
    await page.goto("/kiosk", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    const testImagePath = path.join(FIXTURES_DIR, "e2e-test.jpg");
    const jpegData = fs.readFileSync(testImagePath);

    await request.post("/api/photos", {
      multipart: {
        photo: {
          name: `kiosk-timer-${Date.now()}.jpg`,
          mimeType: "image/jpeg",
          buffer: jpegData,
        },
      },
    });

    await expect(
      page.locator("button:has-text('Discard')")
    ).toBeVisible({ timeout: 10_000 });

    const timerCircles = page.locator("svg circle");
    await expect(timerCircles).toHaveCount(2);
  });
});

test.describe("Navigation", () => {
  test("home page shows all navigation options", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.locator("text=PhotoEvent")).toBeVisible();
    await expect(page.locator("a[href='/capture']")).toBeVisible();
    await expect(page.locator("a[href='/gallery']")).toBeVisible();
    await expect(page.locator("a[href='/qr']")).toBeVisible();
    await expect(page.locator("a[href='/kiosk']")).toBeVisible();
  });
});

test.describe("Config API", () => {
  test("GET /api/config returns default config structure", async ({ request }) => {
    await resetConfig(request);
    const res = await request.get("/api/config");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("event");
    expect(body).toHaveProperty("frame");
    expect(body).toHaveProperty("print");
    expect(body.event).toHaveProperty("name");
    expect(body.event).toHaveProperty("year");
    expect(body.frame).toHaveProperty("paddingPct");
    expect(body.frame).toHaveProperty("barHeightPct");
    expect(body.frame).toHaveProperty("fontSizePct");
    expect(body.frame.barColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(body.frame.barTextColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(body.frame.subtextColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(body.frame.backgroundColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(body.print).toHaveProperty("paperSize");
    expect(body.print).toHaveProperty("orientation");
    expect(body.print).toHaveProperty("margin");
    expect(body.event.name).toBe("PhotoEvent");
    expect(body.event.year).toBe("2026");
    expect(body.frame.paddingPct).toBe(0.025);
    expect(body.frame.barHeightPct).toBe(0.10);
    expect(body.frame.fontSizePct).toBe(0.0225);
    expect(body.print.paperSize).toBe("A4");
    expect(body.print.orientation).toBe("landscape");
    expect(body.print.margin).toBe("10mm");
  });

  test("PUT /api/config saves and GET returns updated config", async ({
    request,
  }) => {
    const updatedConfig = {
      event: { name: "E2E Test Event", year: "2027" },
      frame: {
        paddingPct: 0.03,
        barHeightPct: 0.12,
        fontSizePct: 0.025,
        barColor: "#ff0000",
        barTextColor: "#00ff00",
        subtextColor: "#0000ff",
        backgroundColor: "#ffff00",
      },
      print: { paperSize: "5x7in", orientation: "portrait", margin: "15mm" },
    };

    const saveRes = await request.put("/api/config", {
      data: updatedConfig,
    });
    expect(saveRes.status()).toBe(200);

    const getRes = await request.get("/api/config");
    expect(getRes.status()).toBe(200);
    const body = await getRes.json();
    expect(body.event.name).toBe("E2E Test Event");
    expect(body.event.year).toBe("2027");
    expect(body.frame.paddingPct).toBe(0.03);
    expect(body.frame.barHeightPct).toBe(0.12);
    expect(body.frame.fontSizePct).toBe(0.025);
    expect(body.frame.barColor).toBe("#ff0000");
    expect(body.frame.barTextColor).toBe("#00ff00");
    expect(body.frame.subtextColor).toBe("#0000ff");
    expect(body.frame.backgroundColor).toBe("#ffff00");
    expect(body.print.paperSize).toBe("5x7in");
    expect(body.print.orientation).toBe("portrait");
    expect(body.print.margin).toBe("15mm");
  });

  test("PUT /api/config merges partial updates", async ({ request }) => {
    await request.put("/api/config", {
      data: {
        event: { name: "Full Config", year: "2025" },
        frame: {
          paddingPct: 0.04,
          barHeightPct: 0.15,
          fontSizePct: 0.03,
          barColor: "#111111",
          barTextColor: "#222222",
          subtextColor: "#333333",
          backgroundColor: "#444444",
        },
        print: { paperSize: "8x10in", orientation: "portrait", margin: "20mm" },
      },
    });

    const partialRes = await request.put("/api/config", {
      data: { event: { name: "Partial Update" } },
    });
    expect(partialRes.status()).toBe(200);

    const getRes = await request.get("/api/config");
    const body = await getRes.json();
    expect(body.event.name).toBe("Partial Update");
    expect(body.event.year).toBe("2025");
    expect(body.frame.paddingPct).toBe(0.04);
    expect(body.print.paperSize).toBe("8x10in");
  });

  test("GET /api/event reflects config changes", async ({ request }) => {
    await request.put("/api/config", {
      data: { event: { name: "Reflected Event", year: "2030" } },
    });

    const eventRes = await request.get("/api/event");
    expect(eventRes.status()).toBe(200);
    const body = await eventRes.json();
    expect(body.name).toBe("Reflected Event");
    expect(body.year).toBe("2030");
  });

  test("PUT /api/config with empty body preserves current config", async ({
    request,
  }) => {
    await resetConfig(request);
    const before = await (await request.get("/api/config")).json();

    const res = await request.put("/api/config", { data: {} });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual(before);
  });
});

test.describe("Config Page", () => {
  test("config page loads and shows default values", async ({ page, request }) => {
    await resetConfig(request);
    await page.goto("/config", { waitUntil: "domcontentloaded" });

    await expect(page.locator("text=Configuration")).toBeVisible({
      timeout: 5000,
    });

    await expect(page.getByRole("heading", { name: "Event", exact: true })).toBeVisible();
    await expect(page.getByText("Event name", { exact: true })).toBeVisible();
    await expect(page.getByText("Year", { exact: true })).toBeVisible();

    await expect(page.getByRole("heading", { name: "Frame", exact: true })).toBeVisible();
    await expect(page.getByText("Padding (proportional)", { exact: true })).toBeVisible();
    await expect(page.getByText("Bar height (proportional)", { exact: true })).toBeVisible();

    await expect(page.getByRole("heading", { name: "Print", exact: true })).toBeVisible();

    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  });

  test("config page event name input reflects saved config", async ({
    page,
    request,
  }) => {
    await request.put("/api/config", {
      data: { event: { name: "Loaded Event", year: "2025" } },
    });

    await page.goto("/config", { waitUntil: "domcontentloaded" });

    const nameInput = page.locator("label:has-text('Event name')").locator("..").locator("input");
    await expect(nameInput).toHaveValue("Loaded Event");

    const yearInput = page.locator("label:has-text('Year')").locator("..").locator("input");
    await expect(yearInput).toHaveValue("2025");
  });

  test("config page updates event name and saves", async ({
    page,
    request,
  }) => {
    await page.goto("/config", { waitUntil: "domcontentloaded" });

    const nameInput = page.locator("label:has-text('Event name')").locator("..").locator("input");
    await nameInput.clear();
    await nameInput.fill("Updated via UI");

    await page.locator("button:has-text('Save')").click();

    await expect(page.locator("text=Saved!")).toBeVisible({ timeout: 5000 });

    const res = await request.get("/api/config");
    const body = await res.json();
    expect(body.event.name).toBe("Updated via UI");
  });

  test("config page updates frame settings and saves", async ({
    page,
    request,
  }) => {
    await page.goto("/config", { waitUntil: "domcontentloaded" });

    const paddingInput = page.locator("label:has-text('Padding (proportional)')").locator("..").locator("input");
    await paddingInput.clear();
    await paddingInput.fill("0.03");

    const barHeightInput = page.locator("label:has-text('Bar height (proportional)')").locator("..").locator("input");
    await barHeightInput.clear();
    await barHeightInput.fill("0.12");

    const fontSizeInput = page.locator("label:has-text('Font size (proportional)')").locator("..").locator("input");
    await fontSizeInput.clear();
    await fontSizeInput.fill("0.025");

    await page.locator("button:has-text('Save')").click();
    await expect(page.locator("text=Saved!")).toBeVisible({ timeout: 5000 });

    const res = await request.get("/api/config");
    const body = await res.json();
    expect(body.frame.paddingPct).toBe(0.03);
    expect(body.frame.barHeightPct).toBe(0.12);
    expect(body.frame.fontSizePct).toBe(0.025);
  });

  test("config page paper size changes orientation", async ({ page, request }) => {
    await page.goto("/config", { waitUntil: "domcontentloaded" });

    const paperSelect = page.locator("label:has-text('Paper size')").locator("..").locator("select");
    await paperSelect.selectOption("5x7in");

    await page.locator("button:has-text('Save')").click();
    await expect(page.locator("text=Saved!")).toBeVisible({ timeout: 5000 });

    const res = await request.get("/api/config");
    const body = await res.json();
    expect(body.print.paperSize).toBe("5x7in");
    expect(body.print.orientation).toBe("portrait");
  });

  test("config page preview updates with current event name", async ({
    page,
    request,
  }) => {
    await request.put("/api/config", {
      data: { event: { name: "My Unique Event", year: "2099" } },
    });

    await page.goto("/config", { waitUntil: "domcontentloaded" });

    const preview = page.getByText("Preview", { exact: true }).locator("..");
    await expect(
      preview.getByText("My Unique Event", { exact: true })
    ).toBeVisible({ timeout: 5000 });
  });
});
