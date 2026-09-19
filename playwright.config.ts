import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["**/e2e.spec.ts", "**/config-persistence.spec.ts", "**/deployment-config-persistence.spec.ts", "**/kiosk.spec.ts", "**/capture-ai.spec.ts", "**/kiosk-choice.spec.ts"],
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  // The E2E specs share one file-backed settings store. Run them serially so
  // tests that update /api/config cannot overwrite another test's fixture.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 5000,
    navigationTimeout: 10000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "./test-results",
});
