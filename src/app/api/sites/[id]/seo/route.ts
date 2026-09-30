import { NextRequest, NextResponse } from "next/server";
import { run } from "@/lib/db";
import { isResponse, requireSite } from "@/lib/guard";
import { parseRange, clampRetention } from "@/lib/range";
import {
  disconnect,
  getIntegration,
  googleConfigured,
  pickProperty,
  propertyCandidates,
  searchAnalytics,
  accessToken,
} from "@/lib/gsc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const c = await requireSite(id, "viewer");
  if (isResponse(c)) return c;

  if (!googleConfigured())
    return NextResponse.json({
      configured: false,
      connected: false,
      error: "Google OAuth is not configured on this deployment",
    });

  const integration = await getIntegration(c.user.id, id);
  if (!integration)
    return NextResponse.json({ configured: true, connected: false });

  const range = clampRetention(parseRange(req), c.user.plan);
  try {
    const token = await accessToken(integration);
    const stored = JSON.parse(integration.meta || "{}");
    let property: string = stored.property || "";
    if (!property) {
      property = (await pickProperty(token, c.site.domain)) || "";
      if (property) {
        await run("UPDATE integrations SET meta = ? WHERE id = ?", [
          JSON.stringify({ ...stored, property }),
          integration.id,
        ]);
      }
    }

    if (!property)
      return NextResponse.json({
        configured: true,
        connected: true,
        property: null,
        candidates: propertyCandidates(c.site.domain),
        queries: [],
        pages: [],
        countries: [],
        note: "No Search Console property found for this domain. Verify the domain in Google Search Console first.",
      });

    const [queries, pages, countries] = await Promise.all([
      searchAnalytics({ token, property, from: new Date(range.from), to: new Date(range.to), dimensions: ["query"] }),
      searchAnalytics({ token, property, from: new Date(range.from), to: new Date(range.to), dimensions: ["page"] }),
      searchAnalytics({ token, property, from: new Date(range.from), to: new Date(range.to), dimensions: ["country"], limit: 10 }),
    ]);

    return NextResponse.json({
      configured: true,
      connected: true,
      property,
      range,
      queries,
      pages,
      countries,
      note: "Google Search Console data lags by up to 3 days.",
    });
  } catch (e) {
    const err = e as Error & { status?: number };
    if (err.status === 401) await disconnect(c.user.id, id);
    return NextResponse.json(
      {
        configured: true,
        connected: err.status !== 401,
        error: err.message,
        queries: [],
        pages: [],
        countries: [],
      },
      { status: err.status && err.status < 500 ? 502 : 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const c = await requireSite(id, "editor");
  if (isResponse(c)) return c;
  await disconnect(c.user.id, id);
  return NextResponse.json({ ok: true });
}
