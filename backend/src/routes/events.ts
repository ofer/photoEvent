import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.json({
    name: process.env.EVENT_NAME || "PhotoEvent",
    year: process.env.EVENT_YEAR || "2026",
  });
});

export { router as eventRouter };
