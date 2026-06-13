import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://backend:4000";

export function middleware(request: NextRequest) {
  const url = request.nextUrl;

  // Proxy all /api/* requests to the backend
  if (url.pathname.startsWith("/api/")) {
    const backendUrl = `${BACKEND_URL}${url.pathname}${url.search}`;

    // Forward the request to the backend
    return fetch(backendUrl, {
      method: request.method,
      headers: {
        "Content-Type": request.headers.get("Content-Type") || "application/json",
        "Accept": request.headers.get("Accept") || "*/*",
      },
      body:
        request.method !== "GET" && request.method !== "HEAD"
          ? request.body
          : undefined,
    }).then(async (response) => {
      const headers = new Headers(response.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type, Accept");

      // For SSE streaming, prevent caching
      if (url.pathname === "/api/updates") {
        headers.set("Cache-Control", "no-cache");
        headers.set("Connection", "keep-alive");
        headers.set("Content-Type", "text/event-stream");
      }

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
