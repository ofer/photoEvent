import { Request, Response } from "express";

const subscribers: Response[] = [];
const SSE_HEARTBEAT_MS = 15_000;

export function subscribe(req: Request, res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Prevent reverse proxies from buffering this streaming response.
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.flushHeaders();

  // Send SSE comments while idle. Traefik (or an upstream firewall) can close
  // an entirely silent HTTP stream after roughly five minutes.
  const heartbeat = setInterval(() => {
    res.write(`: keep-alive ${Date.now()}\n\n`);
  }, SSE_HEARTBEAT_MS);

  console.log(`[SSE] Subscribed, total: ${subscribers.length + 1}`);
  subscribers.push(res);

  req.on("close", () => {
    clearInterval(heartbeat);
    const index = subscribers.indexOf(res);
    if (index !== -1) {
      subscribers.splice(index, 1);
      console.log(`[SSE] Unsubscribed, total: ${subscribers.length}`);
    }
  });
}

export function notifyNewPhoto(photo: {
  id: string;
  name: string;
  timestamp: string;
  url: string;
  thumb: string;
  aiButton: string | null;
}) {
  console.log(`[SSE] Notifying ${subscribers.length} subscribers:`, photo.id);
  const data = JSON.stringify(photo);

  for (const sub of subscribers) {
    const wrote = sub.write(`data: ${data}\n\n`);
    console.log(`[SSE] Write to subscriber: ${wrote}`);
  }
}

export function getSSEHandler() {
  return subscribe;
}
