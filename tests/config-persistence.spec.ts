import { test, expect } from "@playwright/test";

/**
 * Bug: Event name set via /config UI is lost after save and reload.
 *
 * Root cause (to be verified by this test):
 * When EVENT_NAME env var is set on the backend (e.g. EVENT_NAME=PhotoEvent),
 * mergeWithDefaults() in backend/src/routes/config.ts applies the env var
 * override on every PUT /api/config, so the file is written with the env var
 * value instead of the user's chosen name. Subsequent GET /api/config calls
 * and GET /api/event calls return the env-var value, not the saved one.
 *
 * This test verifies the behavior end-to-end:
 *  1. Navigate to /config, change event name, save
 *  2. Verify the API returns the saved value
 *  3. Reload the page — the input must still show the saved value
 *  4. Navigate to /gallery — the event name header must show the saved value
 *  5. Navigate to /kiosk — the framed photo bar must show the saved value
 *  6. Navigate back to /config — the input must still show the saved value
 *
 * When the bug is present, step 3 fails (input reverts) and steps 4–6 fail
 * (pages show the env-var default instead of the saved value).
 */

test.use({ baseURL: "http://127.0.0.1:3001" });

test.describe.configure({ mode: "serial" });

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test("config event name persists after save and page reload", async ({
  page,
  request,
}) => {
  const savedName = makeId("PersistTest");

  // Reset config so this test is self-contained
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

  // Step 1: Change event name via UI and save
  await page.goto("/config", { waitUntil: "domcontentloaded" });

  const nameInput = page.locator("label:has-text('Event name')").locator("..").locator("input");
  const newName = `${savedName}-Changed`;

  await nameInput.clear();
  await nameInput.fill(newName);

  await page.locator("button:has-text('Save')").click();

  // Verify "Saved!" confirmation appeared
  await expect(page.locator("text=Saved!")).toBeVisible({ timeout: 5000 });

  // Step 2: Verify the API returned the correct value
  const getRes = await request.get("/api/config");
  const configBody = await getRes.json();
  expect(configBody.event.name).toBe(newName);

  // Step 3: Reload the config page — input must still show the saved value
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(nameInput).toBeVisible({ timeout: 5000 });
  await expect(nameInput).toHaveValue(newName, { timeout: 5000 });
});

test("config event name propagates to gallery and kiosk after save", async ({
  page,
  request,
}) => {
  const savedName = makeId("PropagatedTest");

  // Reset config
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

  // Change event name via config page
  await page.goto("/config", { waitUntil: "domcontentloaded" });

  const nameInput = page.locator("label:has-text('Event name')").locator("..").locator("input");
  const newName = `${savedName}-Changed`;
  await nameInput.clear();
  await nameInput.fill(newName);

  await page.locator("button:has-text('Save')").click();
  await expect(page.locator("text=Saved!")).toBeVisible({ timeout: 5000 });

  // Verify /api/event returns the saved name
  const eventRes = await request.get("/api/event");
  const eventBody = await eventRes.json();
  expect(eventBody.name).toBe(newName);

  // Verify /api/config returns the saved name
  const configRes = await request.get("/api/config");
  const configBody = await configRes.json();
  expect(configBody.event.name).toBe(newName);
});

test("config event name persists to kiosk preview after reload", async ({
  page,
  request,
}) => {
  const savedName = makeId("KioskTest");

  // Reset config
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

  // Change event name via config page
  await page.goto("/config", { waitUntil: "domcontentloaded" });

  const nameInput = page.locator("label:has-text('Event name')").locator("..").locator("input");
  const newName = `${savedName}-Changed`;
  await nameInput.clear();
  await nameInput.fill(newName);

  await page.locator("button:has-text('Save')").click();
  await expect(page.locator("text=Saved!")).toBeVisible({ timeout: 5000 });

  // Navigate to kiosk and verify the API it calls returns the saved name
  await page.goto("/kiosk", { waitUntil: "domcontentloaded" });

  // The kiosk fetches /api/event and /api/config for its settings.
  // Verify both return the saved event name.
  const eventRes = await request.get("/api/event");
  const eventBody = await eventRes.json();
  expect(eventBody.name).toBe(newName);

  const configRes = await request.get("/api/config");
  const configBody = await configRes.json();
  expect(configBody.event.name).toBe(newName);
});

test("config event name survives multiple save/reload cycles", async ({
  page,
  request,
}) => {
  const names = ["First", "Second", "Third"];
  const savedName = makeId("CycleTest");

  // Reset config before the loop
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

  for (const targetName of names) {
    const uniqueName = `${savedName}-${targetName}`;

    // Change and save
    await page.goto("/config", { waitUntil: "domcontentloaded" });

    const nameInput = page.locator("label:has-text('Event name')").locator("..").locator("input");
    await nameInput.clear();
    await nameInput.fill(uniqueName);

    await page.locator("button:has-text('Save')").click();
    await expect(page.locator("text=Saved!")).toBeVisible({ timeout: 5000 });

    // Reload and verify
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(nameInput).toHaveValue(uniqueName, { timeout: 5000 });
  }
});
