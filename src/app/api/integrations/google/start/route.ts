import { NextRequest, NextResponse } from "next/server";
import { isResponse, requireSite } from "@/lib/guard";
import { authUrl, googleConfigured } from "@/lib/gsc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Kicks off the Google OAuth flow for one site: /start?site=<siteId> */
export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get("site") || "";
  if (!siteId)
    return NextResponse.json({ error: "Missing site" }, { status: 400 });

  const c = await requireSite(siteId, "editor");
  if (isResponse(c)) return c;

  if (!googleConfigured())
    return NextResponse.json(
      { error: "Google OAuth is not configured on this deployment" },
      { status: 503 },
    );

  return NextResponse.redirect(authUrl(c.user.id, siteId), 302);
}
