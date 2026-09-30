import { NextRequest, NextResponse } from "next/server";
import { requireSite, isResponse } from "@/lib/guard";
import { parseRange, clampRetention } from "@/lib/range";
import * as stats from "@/lib/stats";
import { all } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const c = await requireSite(id, "viewer");
  if (isResponse(c)) return c;

  const range = clampRetention(parseRange(req), c.user.plan);
  const view = req.nextUrl.searchParams.get("view") || "overview";

  if (view === "realtime") {
    return NextResponse.json(await stats.realtime(id));
  }

  const funnelRows = await all<{ id: string; name: string; steps: string }>(
    "SELECT * FROM funnels WHERE website_id = ? ORDER BY created_at DESC",
    [id],
  );

  const funnels: Awaited<ReturnType<typeof buildFunnel>>[] = [];
  for (const f of funnelRows) funnels.push(await buildFunnel(f, id, range));

  const payload = {
    range,
    funnels,
    granularity: stats.granularityFor(range),
    overview: await stats.overview(id, range),
    series: await stats.series(id, range),
    pages: await stats.breakdown(id, range, "path", 15),
    referrers: await stats.breakdown(id, range, "referrer_source", 15),
    sources: await stats.breakdown(id, range, "utm_source", 15),
    utmMedium: await stats.breakdown(id, range, "utm_medium", 15),
    utmCampaign: await stats.breakdown(id, range, "utm_campaign", 15),
    countries: await stats.breakdown(id, range, "country", 15),
    cities: await stats.breakdown(id, range, "city", 12),
    browsers: await stats.breakdown(id, range, "browser", 10),
    platforms: await stats.breakdown(id, range, "os", 10),
    devices: await stats.deviceBreakdown(id, range),
    entry: await stats.entryPages(id, range),
    exit: await stats.exitPages(id, range),
    goals: await stats.goalsStats(id, range),
    payments: await stats.paymentsList(id, range),
    revenue: await stats.revenueBySource(id, range, "first"),
    revenueLast: await stats.revenueBySource(id, range, "last"),
  };
  return NextResponse.json(payload);
}

async function buildFunnel(
  f: { id: string; name: string; steps: string },
  siteId: string,
  range: stats.Range,
) {
  let steps: stats.FunnelStep[] = [];
  try {
    steps = JSON.parse(f.steps);
  } catch {
    steps = [];
  }
  return {
    id: f.id,
    name: f.name,
    steps,
    results: await stats.funnelStats(siteId, range, steps),
  };
}
