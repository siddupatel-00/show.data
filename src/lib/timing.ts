import { NextResponse } from "next/server";
import { dbTiming } from "./db";

/**
 * Reports handler time in a `server-timing` header so TTFB can be split into
 * network + server work (visible in DevTools and `curl -D`). Includes DB
 * round-trip counts when the handler touched the database.
 */
export function withTiming<T extends NextResponse>(res: T, t0: number): T {
  const parts = [`app;dur=${Date.now() - t0}`];
  const db = dbTiming();
  if (db.stmts > 0 || db.flushes > 0 || db.bootMs > 0) {
    parts.push(
      `db;dur=${db.dbMs};stmts=${db.stmts};flushes=${db.flushes};boot=${db.bootMs}`,
    );
  }
  res.headers.set("server-timing", parts.join(", "));
  return res;
}

export function startedAt(): number {
  return Date.now();
}
