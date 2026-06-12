import { Router } from "express";
import { getSSEHandler } from "../sse";

const router = Router();
const sseHandler = getSSEHandler();

router.get("/", sseHandler);

export { router as sseRouter };
