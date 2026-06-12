import { Router } from "express";

const router = Router();

const eventConfig = {
  name: process.env.EVENT_NAME || "PhotoEvent",
  year: process.env.EVENT_YEAR || "2026",
};

router.get("/", (_req, res) => {
  res.json(eventConfig);
});

export { router as eventRouter };
