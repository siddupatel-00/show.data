import { NextResponse } from "next/server";

/**
 * Reports handler time in a `server-timing` header so TTFB can be split into
 * network + server work (visible in DevTools and `curl -D`).
 */
export function withTiming<T extends NextResponse>(res: T, t0: number): T {
  res.headers.set("server-timing", `app;dur=${Date.now() - t0}`);
  return res;
}

export function startedAt(): number {
  return Date.now();
}
