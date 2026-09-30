import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, readState, saveIntegration } from "@/lib/gsc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Google redirects here after consent. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const code = q.get("code");
  const state = q.get("state") || "";
  const oauthError = q.get("error");

  const parsed = readState(state);
  if (oauthError || !code || !parsed)
    return NextResponse.redirect(
      new URL("/dashboard?seo=failed", req.url),
      302,
    );

  try {
    const tokens = await exchangeCode(code);
    await saveIntegration(parsed.userId, parsed.siteId, tokens, {
      connected_at: Date.now(),
    });
    return NextResponse.redirect(
      new URL(`/dashboard/${parsed.siteId}?tab=seo&seo=connected`, req.url),
      302,
    );
  } catch (e) {
    console.error("google oauth", e);
    return NextResponse.redirect(
      new URL(`/dashboard/${parsed.siteId}?tab=seo&seo=failed`, req.url),
      302,
    );
  }
}
