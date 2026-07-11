import { test, expect } from "@playwright/test";

/**
 * Deployment config-persistence regression — reproduces the bug on the
 * live deployed app at http://10.0.0.3:3300.
 *
 * Bug: Event name set via /config UI is lost after save and reload.
 *
 * Steps (single test for speed):
 *  1. Reset config via PUT /api/config
 *  2. Navigate to /config, change event name, click Save
 *  3. Assert "Saved!" toast appears
 *  4. Verify GET /api/config returns the saved name
 *  5. Verify GET /api/event returns the saved name
 *  6. Reload the /config page — input must still show the saved value
 *  7. Navigate to /kiosk — verify /api/event and /api/config still return the saved name
 *
 * When the bug is present, step 6 fails (input reverts) and step 7 fails
 * (endpoints return the env-var default instead of the saved value).
 */

test.use({ baseURL: "http://10.0.0.3:3300" });

test.describe.configure({ mode: "serial" });

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test("deployment config event name persists after save and reload", async ({
  page,
  request,
}) => {
  const savedName = makeId("DeployPersist");

  // --- Reset config so this test is self-contained ---
  await request.put("/api/config", {
    data: {
      event: { name: savedName, year: "2026" },
      frame: {
        paddingPct: 0.025,
        barHeightPct: 0.10,
        fontSizePct: 0.0225,
        barColor: "#1e1e1e",
        barTextColor: "#ffffff",
        subtextColor: "#cccccc",
        backgroundColor: "#ffffff",
      },
      print: { paperSize: "A4", orientation: "landscape", margin: "10mm" },
    },
  });

  // --- Step 1: Change event name via /config UI and save ---
  await page.goto("/config", { waitUntil: "domcontentloaded" });

  const nameInput = page.locator("label:has-text('Event name')").locator("..").locator("input");
  const newName = `${savedName}-Changed`;

  await nameInput.clear();
  await nameInput.fill(newName);

  await page.locator("button:has-text('Save')").click();

  // --- Step 2: "Saved!" confirmation appeared ---
  await expect(page.locator("text=Saved!")).toBeVisible({ timeout: 5000 });

  // --- Step 3: Verify GET /api/config returns the saved name ---
  const configRes = await request.get("/api/config");
  const configBody = await configRes.json();
  expect(configBody.event.name).toBe(newName);

  // --- Step 4: Verify GET /api/event returns the saved name ---
  const eventRes = await request.get("/api/event");
  const eventBody = await eventRes.json();
  expect(eventBody.name).toBe(newName);

  // --- Step 5: Reload the config page — input must still show the saved value ---
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(nameInput).toBeVisible({ timeout: 5000 });
  await expect(nameInput).toHaveValue(newName, { timeout: 5000 });

  // --- Step 6: Navigate to /kiosk — verify API endpoints still return saved name ---
  await page.goto("/kiosk", { waitUntil: "domcontentloaded" });

  const eventResAfterKiosk = await request.get("/api/event");
  const eventBodyAfterKiosk = await eventResAfterKiosk.json();
  expect(eventBodyAfterKiosk.name).toBe(newName);

  const configResAfterKiosk = await request.get("/api/config");
  const configBodyAfterKiosk = await configResAfterKiosk.json();
  expect(configBodyAfterKiosk.event.name).toBe(newName);
});
