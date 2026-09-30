import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { get, run } from "./db";

/**
 * Fixed-window limiter backed by the database, so the limit holds across
 * serverless instances and restarts (an in-memory counter would not).
 */
export type LimitResult = {
  ok: boolean;
  remaining: number;
  retryAfter: number;
};

export async function rateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<LimitResult> {
  const now = Date.now();
  const windowStart = Math.floor(now / opts.windowMs) * opts.windowMs;

  let count = 1;
  try {
    const res = await get<{ window_start: number; count: number }>(
      "SELECT window_start, count FROM rate_limits WHERE key = ?",
      [opts.key],
    );
    if (res && res.window_start === windowStart) {
      count = res.count + 1;
      await run(
        "UPDATE rate_limits SET count = ? WHERE key = ? AND window_start = ?",
        [count, opts.key, windowStart],
      );
    } else {
      await run(
        `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
         ON CONFLICT (key) DO UPDATE SET window_start = excluded.window_start, count = 1`,
        [opts.key, windowStart],
      );
    }
  } catch (e) {
    console.error("rate limit store failed", e);
    return { ok: true, remaining: opts.limit, retryAfter: 0 };
  }

  const retryAfter = Math.ceil((windowStart + opts.windowMs - now) / 1000);
  return {
    ok: count <= opts.limit,
    remaining: Math.max(0, opts.limit - count),
    retryAfter,
  };
}

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

/** Convenience: enforce a limit, or return the 429 response to send back. */
export async function enforce(
  req: NextRequest,
  name: string,
  limit: number,
  windowMs: number,
  extra = "",
): Promise<NextResponse | null> {
  const res = await rateLimit({
    key: `${name}:${extra || clientIp(req)}`,
    limit,
    windowMs,
  });
  if (res.ok) return null;
  return NextResponse.json(
    { error: "Too many attempts. Try again in a minute." },
    { status: 429, headers: { "Retry-After": String(res.retryAfter) } },
  );
}
