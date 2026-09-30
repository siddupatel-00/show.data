import { NextRequest, NextResponse } from "next/server";
import { requireSite, isResponse } from "@/lib/guard";
import { run } from "@/lib/db";
import { shortId } from "@/lib/ids";
import type { FunnelStep } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function sanitize(steps: unknown): FunnelStep[] {
  if (!Array.isArray(steps) || steps.length === 0) return [];
  return steps.slice(0, 8).map((s: any) => ({
    name: String(s?.name || "Step").slice(0, 60),
    kind: s?.kind === "goal" ? "goal" : "path",
    value: String(s?.value || "").slice(0, 200),
  }));
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const c = await requireSite(id, "editor");
  if (isResponse(c)) return c;
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim().slice(0, 60);
  const steps = sanitize(body.steps);
  if (!name || steps.length < 2)
    return NextResponse.json(
      { error: "Name and at least 2 steps are required" },
      { status: 400 },
    );
  const fid = `f_${shortId(12)}`;
  await run(
    "INSERT INTO funnels (id, website_id, name, steps, created_at) VALUES (?, ?, ?, ?, ?)",
    [fid, id, name, JSON.stringify(steps), Date.now()],
  );
  return NextResponse.json({ id: fid, name, steps });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const c = await requireSite(id, "editor");
  if (isResponse(c)) return c;
  const body = await req.json().catch(() => ({}));
  await run("DELETE FROM funnels WHERE id = ? AND website_id = ?", [
    String(body.id || ""),
    id,
  ]);
  return NextResponse.json({ ok: true });
}
