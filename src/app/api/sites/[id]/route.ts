import { NextRequest, NextResponse } from "next/server";
import { requireSite, isResponse } from "@/lib/guard";
import { membersOf, normalizeDomain, roleFor, getSite } from "@/lib/sites";
import { all, run } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const ctxv = await requireSite(id, "viewer");
  if (isResponse(ctxv)) return ctxv;
  const goals = await all(
    "SELECT * FROM goals WHERE website_id = ? ORDER BY created_at DESC",
    [id],
  );
  const funnels = await all(
    "SELECT * FROM funnels WHERE website_id = ? ORDER BY created_at DESC",
    [id],
  );
  return NextResponse.json({
    site: ctxv.site,
    role: ctxv.role,
    members: membersOf(id),
    goals,
    funnels,
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const c = await requireSite(id, "editor");
  if (isResponse(c)) return c;
  const body = await req.json().catch(() => ({}));
  const name = body.name !== undefined ? String(body.name).trim().slice(0, 80) : null;
  const domain =
    body.domain !== undefined ? normalizeDomain(String(body.domain)) : null;
  if (name !== null && !name)
    return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
  if (domain !== null && !domain)
    return NextResponse.json({ error: "Domain cannot be empty" }, { status: 400 });

  const sets: string[] = [];
  const args: (string | number)[] = [];
  if (name !== null) {
    sets.push("name = ?");
    args.push(name);
  }
  if (domain !== null) {
    sets.push("domain = ?");
    args.push(domain);
  }
  if (sets.length) {
    args.push(id);
    await run(`UPDATE websites SET ${sets.join(", ")} WHERE id = ?`, args);
  }
  return NextResponse.json({ site: await getSite(id) });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const c = await requireSite(id, "owner");
  if (isResponse(c)) return c;
  await run("DELETE FROM events WHERE website_id = ?", [id]);
  await run("DELETE FROM goals WHERE website_id = ?", [id]);
  await run("DELETE FROM funnels WHERE website_id = ?", [id]);
  await run("DELETE FROM website_members WHERE website_id = ?", [id]);
  await run("DELETE FROM websites WHERE id = ?", [id]);
  return NextResponse.json({ ok: true });
}
