import { NextResponse } from "next/server";
import { dbTiming, type DbSnapshot } from "./db";

export type RequestStart = DbSnapshot & { t0: number };

/**
 * Snapshot taken at handler start. Paired with `withTiming` it yields a
 * per-request delta (the counters in `db.ts` are global and monotonic).
 */
export function startedAt(): RequestStart {
  return { ...dbTiming(), t0: Date.now() };
}

/**
 * Reports handler time in a `server-timing` header so TTFB can be split into
 * network + server work (visible in DevTools and `curl -D`). DB metrics are
 * emitted only when this request actually touched the database, and `boot`
 * only for the request that paid the one-time init cost.
 */
export function withTiming<T extends NextResponse>(
  res: T,
  start: RequestStart,
): T {
  const parts = [`app;dur=${Date.now() - start.t0}`];
  const db = dbTiming(start);
  if (db.stmts > 0 || db.flushes > 0 || db.dbMs > 0) {
    parts.push(`db;dur=${db.dbMs};stmts=${db.stmts};flushes=${db.flushes}`);
  }
  if (start.bootMs === 0 && db.bootMs > 0) parts.push(`boot=${db.bootMs}`);
  res.headers.set("server-timing", parts.join(", "));
  return res;
}
