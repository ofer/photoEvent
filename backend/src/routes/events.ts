import { Router, Request, Response } from "express";
import { loadConfig } from "./config";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  const config = loadConfig();
  res.json(config.event);
});

export { router as eventRouter };
