import { NextResponse } from "next/server";
import { withTiming, startedAt } from "@/lib/timing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const t0 = startedAt();
  return withTiming(NextResponse.json({ ok: true }), t0);
}
