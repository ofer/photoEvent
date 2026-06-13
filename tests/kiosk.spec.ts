import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const FIXTURES_DIR = path.join(__dirname, "fixtures");

test("kiosk displays framed photo correctly after upload", async ({
  page,
  request,
}) => {
  // 1. Open kiosk page and wait for it to be ready
  await page.goto("/kiosk", { waitUntil: "domcontentloaded" });

  // Verify kiosk is waiting for photos
  await expect(page.locator("text=Waiting for photos")).toBeVisible({
    timeout: 5000,
  });

  // Give the kiosk page time to establish its SSE connection
  // React useEffect may fire after DOMContentLoaded, and we need the EventSource connected before uploading
  await page.waitForTimeout(2000);

  // 2. Upload a photo via the API using a valid JPEG fixture
  const testImagePath = path.join(FIXTURES_DIR, "e2e-test.jpg");
  let jpegData = fs.readFileSync(testImagePath);

  // Generate one if missing (using sharp via child_process)
  if (!fs.existsSync(testImagePath)) {
    const { execSync } = require("child_process");
    execSync(
      `node -e "const sharp=require('sharp');const p=Buffer.alloc(100*100*3);for(let i=0;i<p.length;i+=3){p[i]=200;p[i+1]=100;p[i+2]=50;}sharp(p,{raw:{width:100,height:100,channels:3}}).jpeg({quality:90}).toFile('${testImagePath}').catch(e=>console.error(e))"`,
      { cwd: "/home/ofer/repos/photoEvent/backend" }
    );
    jpegData = fs.readFileSync(testImagePath);
  }

  const uploadResponse = await request.post("/api/photos", {
    multipart: {
      photo: {
        name: "e2e-test.jpg",
        mimeType: "image/jpeg",
        buffer: jpegData,
      },
    },
  });

  expect(uploadResponse.ok()).toBe(true);
  const photo = await uploadResponse.json();
  expect(photo.id).toBeDefined();

  // 3. Wait for the kiosk to receive the SSE event and display the photo
  await expect(
    page.locator("button:has-text('Discard')")
  ).toBeVisible({ timeout: 10_000 });

  // 4. Verify the framed image is visible
  const framedImage = page.locator(".kiosk-print-area img");
  await expect(framedImage).toBeVisible({ timeout: 5000 });

  // 5. Verify image loaded properly (not a broken image)
  const imageInfo = await page.evaluate(() => {
    const img = document.querySelector<HTMLImageElement>(
      ".kiosk-print-area img"
    );
    if (!img) return null;
    return {
      src: img.src,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      complete: img.complete,
    };
  });

  expect(imageInfo).not.toBeNull();
  expect(imageInfo!.naturalWidth).toBeGreaterThan(0);
  expect(imageInfo!.naturalHeight).toBeGreaterThan(0);
  expect(imageInfo!.complete).toBe(true);
  expect(imageInfo!.src).toContain("/api/frame/");

  // 6. Verify countdown timer is visible
  await expect(page.locator("svg circle")).toHaveCount(2, {
    timeout: 5000,
  });
});
