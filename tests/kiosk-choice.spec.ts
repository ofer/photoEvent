import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const FIXTURES_DIR = path.join(__dirname, "fixtures");

/**
 * Wait until React has hydrated the client component and attached its event
 * handlers. `setInputFiles` dispatches a native `change` event; if it fires
 * before hydration, React hasn't subscribed yet and the event is silently
 * dropped (the review screen never appears). Polling for the React fiber
 * property on the element is a deterministic, fast hydration signal.
 */
async function waitForReactReady(
  page: import("@playwright/test").Page,
  selector: string
) {
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

test.describe("Kiosk auto-apply phone choice (Phase 5)", () => {
  test("new photo with aiButton auto-shows framed transform", async ({
    page,
    request,
  }) => {
    // Seed AI buttons
    await request.put("/api/config", {
      data: {
        ai: {
          buttons: [
            { id: "cartoon", label: "Cartoon", workflowJson: '{"1":{}}' },
          ],
          comfyServerUrl: "http://localhost:8188",
        },
      },
    });

    // Stub /api/ai/generate to return a fixed framed image (no real ComfyUI)
    const jpegData = fs.readFileSync(path.join(FIXTURES_DIR, "e2e-test.jpg"));
    const stubDataUrl = `data:image/jpeg;base64,${jpegData.toString("base64")}`;
    await page.route("**/api/ai/generate", async (route) => {
      // Verify the request has the correct photoId and buttonId
      const body = JSON.parse(route.request().postData());
      expect(body).toHaveProperty("photoId");
      expect(body).toHaveProperty("buttonId", "cartoon");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ imageUrl: stubDataUrl }),
      });
    });

    await page.goto("/kiosk", { waitUntil: "domcontentloaded" });
    await expect(page.locator("text=Waiting for photos")).toBeVisible({
      timeout: 15_000,
    });

    // Give the kiosk page time to establish its SSE connection before
    // uploading — a notification that arrives before the EventSource is
    // subscribed is lost (no photo ever appears). Mirrors kiosk.spec.ts.
    await page.waitForTimeout(2000);

    // Upload a photo with aiButton set (simulating a phone upload)
    await request.post("/api/photos", {
      multipart: {
        photo: {
          name: "kiosk-choice-test.jpg",
          mimeType: "image/jpeg",
          buffer: jpegData,
        },
        aiButton: "cartoon",
      },
    });

    // Wait for the photo to appear and auto-apply
    await expect(page.locator("button:has-text('Discard')")).toBeVisible({
      timeout: 15_000,
    });

    // The image should be the stubbed framed result (auto-applied)
    const img = page.locator(".kiosk-print-area img");
    await expect(img).toBeVisible({ timeout: 15_000 });
    const src = await img.getAttribute("src");
    // Should be the stubbed data URL (from /api/ai/generate), not the framed photo URL
    expect(src).toBe(stubDataUrl);

    // Countdown should be running
    await expect(page.locator("text=auto-printing")).toBeVisible();
  });

  test("photo without aiButton shows original framed photo (regression)", async ({
    page,
    request,
  }) => {
    // Seed AI buttons
    await request.put("/api/config", {
      data: {
        ai: {
          buttons: [
            { id: "cartoon", label: "Cartoon", workflowJson: '{"1":{}}' },
          ],
          comfyServerUrl: "http://localhost:8188",
        },
      },
    });

    // Stub /api/ai/generate should NOT be called
    const stubDataUrl = `data:image/jpeg;base64,${fs
      .readFileSync(path.join(FIXTURES_DIR, "e2e-test.jpg"))
      .toString("base64")}`;
    await page.route("**/api/ai/generate", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Should not be called" }),
      });
    });

    await page.goto("/kiosk", { waitUntil: "domcontentloaded" });
    await expect(page.locator("text=Waiting for photos")).toBeVisible({
      timeout: 15_000,
    });

    // Give the kiosk page time to establish its SSE connection before
    // uploading — a notification that arrives before the EventSource is
    // subscribed is lost. Mirrors kiosk.spec.ts.
    await page.waitForTimeout(2000);

    // Upload a photo WITHOUT aiButton
    const jpegData = fs.readFileSync(path.join(FIXTURES_DIR, "e2e-test.jpg"));
    await request.post("/api/photos", {
      multipart: {
        photo: {
          name: "no-ai-button.jpg",
          mimeType: "image/jpeg",
          buffer: jpegData,
        },
      },
    });

    // Wait for the photo to appear
    await expect(page.locator("button:has-text('Discard')")).toBeVisible({
      timeout: 15_000,
    });

    // Should show the framed original, not the stubbed result
    const img = page.locator(".kiosk-print-area img");
    await expect(img).toBeVisible({ timeout: 15_000 });
    const src = await img.getAttribute("src");
    expect(src).toContain("/api/frame/");
    expect(src).not.toBe(stubDataUrl);
  });
});
