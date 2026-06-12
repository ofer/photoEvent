import { Request, Response } from "express";

const subscribers: Response[] = [];

export function subscribe(req: Request, res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  subscribers.push(res);

  req.on("close", () => {
    const index = subscribers.indexOf(res);
    if (index !== -1) {
      subscribers.splice(index, 1);
    }
  });
}

export function notifyNewPhoto(photo: {
  id: string;
  name: string;
  timestamp: string;
  url: string;
  thumb: string;
}) {
  const data = JSON.stringify(photo);

  for (const sub of subscribers) {
    sub.write(`data: ${data}\n\n`);
  }
}

export function getSSEHandler() {
  return subscribe;
}
