import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import { photoRouter } from "./routes/photos";
import { eventRouter } from "./routes/events";
import { sseRouter } from "./routes/sse";
import { frameRouter } from "./routes/frame";
import { qrRouter } from "./routes/qr";
import { configRouter } from "./routes/config";
import { aiRouter } from "./routes/ai";

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Routes
app.use("/api/photos", photoRouter);
app.use("/api/event", eventRouter);
app.use("/api/config", configRouter);
app.use("/api/updates", sseRouter);
app.use("/api/frame", frameRouter);
app.use("/api/qr", qrRouter);
app.use("/api/ai", aiRouter);

// Health check
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    console.error("Multer error:", err.code, err.message);
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "File too large. Maximum size is 20MB." });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err.message === "Only image files are allowed") {
    return res.status(400).json({ error: "Only image files are allowed" });
  }
  // ENOSPC = disk full / no space left on device
  if ((err as NodeJS.ErrnoException).code === "ENOSPC") {
    console.error("Disk full — cannot write files");
    return res.status(507).json({ error: "Storage is full. Contact the administrator." });
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
