import type { NextRequest } from "next/server";
import type { Range } from "./stats";
import type { Plan } from "./auth";
import { retentionFloor } from "./plans";

export const MAX_RANGE = 366 * 86400_000;

export function parseRange(req: NextRequest): Range {
  const q = req.nextUrl.searchParams;
  const now = Date.now();
  let to = Number(q.get("to")) || now;
  let from = Number(q.get("from")) || now - 30 * 86400_000;
  if (to - from > MAX_RANGE) from = to - MAX_RANGE;
  if (from >= to) from = to - 86400_000;
  return { from, to };
}

/** Data outside the plan's retention window is not queryable. */
export function clampRetention(range: Range, plan: Plan): Range {
  const floor = retentionFloor(plan);
  if (range.to <= floor) return { from: floor - 86400_000, to: floor };
  if (range.from < floor) return { ...range, from: floor };
  return range;
}
