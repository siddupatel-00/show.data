import { NextRequest, NextResponse } from "next/server";
import { getSiteByToken } from "@/lib/sites";
import { recordPayment } from "@/lib/collect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * Server-side revenue ingestion.
 * Auth: ?key=s_xxx  OR  Authorization: Bearer s_xxx  OR  { "key": "s_xxx" }
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const key =
    req.headers.get("authorization")?.replace(/^bearer\s+/i, "") ||
    req.nextUrl.searchParams.get("key") ||
    (typeof body.key === "string" ? body.key : "");

  const site = key ? await getSiteByToken(key) : undefined;
  if (!site || site.id !== id)
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: CORS },
    );

  const res = await recordPayment(site, body, req.headers);
  return NextResponse.json(res, { status: res.ok ? 200 : 400, headers: CORS });
}
