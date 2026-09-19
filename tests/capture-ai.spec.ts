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
 * (Same helper as tests/e2e.spec.ts.)
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

// Serial: the two tests share the backend's settings.json ai.buttons section
// (both PUT it before asserting), so they must not interleave. No other spec
// file mutates ai.buttons, and PUTs that omit `ai` preserve it.
test.describe.configure({ mode: "serial" });

test.describe("Phone AI transform flow (stubbed ComfyUI)", () => {
  test("capture → AI button → preview changes → Accept (with aiButton) → photo in kiosk queue", async ({
    page,
    context,
    request,
  }) => {
    // Seed the AI buttons the capture page will render (same source the kiosk
    // uses). No real ComfyUI is involved: /api/ai/transform is stubbed below.
    await request.put("/api/config", {
      data: {
        ai: {
          buttons: [
            { id: "cartoon", label: "Cartoon", workflowJson: '{"1":{}}' },
            { id: "tropical", label: "Tropical", workflowJson: '{"1":{}}' },
          ],
        },
      },
    });

    const jpegData = fs.readFileSync(path.join(FIXTURES_DIR, "e2e-test.jpg"));
    const stubDataUrl = `data:image/jpeg;base64,${jpegData.toString("base64")}`;

    // Watch the kiosk before the capture happens
    const kiosk = await context.newPage();
    await kiosk.goto("/kiosk", { waitUntil: "domcontentloaded" });
    await expect(kiosk.locator("text=Waiting for photos")).toBeVisible({
      timeout: 15_000,
    });

    // Stub the transform endpoint — delay the response so the "Generating…"
    // state is observable.
    await page.route("**/api/ai/transform", async (route) => {
      await new Promise((r) => setTimeout(r, 600));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ imageUrl: stubDataUrl }),
      });
    });

    await page.goto("/capture", { waitUntil: "domcontentloaded" });
    await waitForReactReady(
      page,
      'input[type="file"][capture="environment"]'
    );

    const input = page.locator('input[type="file"][capture="environment"]');
    await input.setInputFiles({
      name: "e2e-ai-capture.jpg",
      mimeType: "image/jpeg",
      buffer: jpegData,
    });

    const preview = page.locator("img[alt='Photo preview']");
    await expect(preview).toBeVisible({ timeout: 10_000 });
    const originalSrc = await preview.getAttribute("src");
    expect(originalSrc).toMatch(/^blob:/);

    // AI button row rendered from /api/config
    const cartoon = page.getByRole("button", { name: "Cartoon", exact: true });
    const tropical = page.getByRole("button", { name: "Tropical", exact: true });
    await expect(cartoon).toBeVisible({ timeout: 10_000 });
    await expect(tropical).toBeVisible();
    await expect(page.getByRole("button", { name: "Show Original" })).toHaveCount(0);

    // Press → "Generating…", all AI buttons disabled
    await cartoon.click();
    const generating = page.getByRole("button", { name: "Generating…" });
    await expect(generating).toBeVisible({ timeout: 5_000 });
    await expect(generating).toBeDisabled();
    await expect(tropical).toBeDisabled();

    // Preview switches to the stubbed transform; Show Original appears
    await expect(preview).toHaveAttribute("src", stubDataUrl, { timeout: 15_000 });
    const showOriginal = page.getByRole("button", { name: "Show Original" });
    await expect(showOriginal).toBeVisible();

    // Show Original restores the original preview
    await showOriginal.click();
    await expect(preview).toHaveAttribute("src", originalSrc);
    await expect(showOriginal).toHaveCount(0);

    // Re-apply the transform and Accept with the choice
    await cartoon.click();
    await expect(preview).toHaveAttribute("src", stubDataUrl, { timeout: 15_000 });

    const uploadPromise = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" && res.url().includes("/api/photos"),
      { timeout: 15_000 }
    );
    await page.getByRole("button", { name: "Accept", exact: true }).click();
    const uploadRes = await uploadPromise;
    expect(uploadRes.status()).toBe(201);
    // The 201 metadata carries the choice (Phase 2 contract)
    expect((await uploadRes.json()).aiButton).toBe("cartoon");

    await expect(page.locator("text=Photo sent to kiosk")).toBeVisible({
      timeout: 15_000,
    });

    // Photo entered the kiosk queue with a countdown
    await expect(kiosk.locator("button:has-text('Discard')")).toBeVisible({
      timeout: 15_000,
    });
    await expect(kiosk.locator(".kiosk-print-area img")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("no AI button row when none configured; Accept uploads without aiButton", async ({
    page,
    request,
  }) => {
    // Reset the shared ai section to no buttons
    await request.put("/api/config", {
      data: { ai: { buttons: [] } },
    });

    const jpegData = fs.readFileSync(path.join(FIXTURES_DIR, "e2e-test.jpg"));

    await page.goto("/capture", { waitUntil: "domcontentloaded" });
    await waitForReactReady(
      page,
      'input[type="file"][capture="environment"]'
    );

    const input = page.locator('input[type="file"][capture="environment"]');
    await input.setInputFiles({
      name: "e2e-ai-none.jpg",
      mimeType: "image/jpeg",
      buffer: jpegData,
    });

    const preview = page.locator("img[alt='Photo preview']");
    await expect(preview).toBeVisible({ timeout: 10_000 });

    // No AI row, no Show Original
    await expect(
      page.getByRole("button", { name: /cartoon|tropical/i })
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Show Original" })).toHaveCount(0);

    // Accept still works and the upload carries no aiButton
    const uploadPromise = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" && res.url().includes("/api/photos"),
      { timeout: 15_000 }
    );
    await page.getByRole("button", { name: "Accept", exact: true }).click();
    const uploadRes = await uploadPromise;
    expect(uploadRes.status()).toBe(201);
    expect((await uploadRes.json()).aiButton).toBeNull();

    await expect(page.locator("text=Photo sent to kiosk")).toBeVisible({
      timeout: 15_000,
    });
  });
});
