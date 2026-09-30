import { NextRequest, NextResponse } from "next/server";
import { requireSite, isResponse } from "@/lib/guard";
import { listGoals, upsertGoal } from "@/lib/collect";
import { run } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const c = await requireSite(id, "viewer");
  if (isResponse(c)) return c;
  return NextResponse.json({ goals: await listGoals(id) });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const c = await requireSite(id, "editor");
  if (isResponse(c)) return c;
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim().slice(0, 128);
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  await upsertGoal(id, name);
  return NextResponse.json({ goals: await listGoals(id) });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const c = await requireSite(id, "editor");
  if (isResponse(c)) return c;
  const body = await req.json().catch(() => ({}));
  await run("DELETE FROM goals WHERE id = ? AND website_id = ?", [
    String(body.id || ""),
    id,
  ]);
  return NextResponse.json({ goals: await listGoals(id) });
}
