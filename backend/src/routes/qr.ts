import { Router, Request, Response } from "express";
import QRCode from "qrcode";

const router = Router();

const CAPTURE_URL =
  process.env.CAPTURE_URL || "http://localhost:3000/capture";

// GET /api/qr — returns a large QR code as PNG
router.get("/", (_req: Request, res: Response) => {
  const size = 600; // Large enough to scan from >1 meter
  QRCode.toDataURL(CAPTURE_URL, {
    width: size,
    margin: 2,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
  })
    .then((dataUrl) => {
      // Strip data URL prefix and decode
      const base64 = dataUrl.split(",")[1];
      const buffer = Buffer.from(base64, "base64");
      res.set("Content-Type", "image/png");
      res.send(buffer);
    })
    .catch((err) => {
      console.error("QR generation error:", err);
      res.status(500).json({ error: "QR generation failed" });
    });
});

export { router as qrRouter };
