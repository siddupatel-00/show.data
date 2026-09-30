import { NextRequest, NextResponse } from "next/server";
import { requireSite, isResponse } from "@/lib/guard";
import { clearDemo, seedDemo } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const c = await requireSite(id, "owner");
  if (isResponse(c)) return c;
  const body = await req.json().catch(() => ({}));

  if (body.clear) {
    await clearDemo(id);
    return NextResponse.json({ ok: true, cleared: true });
  }

  const days = Math.min(90, Math.max(7, Number(body.days) || 60));
  const res = await seedDemo(c.site, days);
  return NextResponse.json({ ok: true, ...res });
}
