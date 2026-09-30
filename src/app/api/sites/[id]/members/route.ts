import { NextRequest, NextResponse } from "next/server";
import { requireSite, isResponse } from "@/lib/guard";
import { get, run } from "@/lib/db";
import { membersOf, roleFor, Role } from "@/lib/sites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const c = await requireSite(id, "viewer");
  if (isResponse(c)) return c;
  return NextResponse.json({ members: await membersOf(id) });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const c = await requireSite(id, "owner");
  if (isResponse(c)) return c;

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const role = (body.role || "viewer") as Role;
  if (!["viewer", "editor"].includes(role))
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const user = await get<{ id: string }>("SELECT id FROM users WHERE email = ?", [email]);
  if (!user)
    return NextResponse.json(
      { error: "No SidFast account with that email — ask them to sign up first" },
      { status: 404 },
    );
  if (user.id === c.site.owner_id)
    return NextResponse.json({ error: "Already the owner" }, { status: 400 });
  if (await roleFor(c.site, user.id))
    return NextResponse.json({ error: "Already a member" }, { status: 409 });

  await run("INSERT INTO website_members (website_id, user_id, role) VALUES (?, ?, ?)", [
    id,
    user.id,
    role,
  ]);
  return NextResponse.json({ members: await membersOf(id) });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const c = await requireSite(id, "owner");
  if (isResponse(c)) return c;
  const body = await req.json().catch(() => ({}));
  const userId = String(body.user_id || "");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });
  await run("DELETE FROM website_members WHERE website_id = ? AND user_id = ?", [
    id,
    userId,
  ]);
  return NextResponse.json({ members: await membersOf(id) });
}
