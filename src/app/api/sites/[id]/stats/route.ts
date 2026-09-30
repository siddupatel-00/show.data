import { NextRequest, NextResponse } from "next/server";
import { requireSite, isResponse } from "@/lib/guard";
import { parseRange, clampRetention } from "@/lib/range";
import * as stats from "@/lib/stats";
import { all } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const TTL = 15_000;
const REALTIME_TTL = 2_000;
const cache = new Map<string, { at: number; data: unknown }>();

function cached(key: string, ttl: number) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  return null;
}

function store(key: string, data: unknown) {
  if (cache.size > 200) {
    for (const k of cache.keys()) {
      cache.delete(k);
      if (cache.size <= 200) break;
    }
  }
  cache.set(key, { at: Date.now(), data });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const c = await requireSite(id, "viewer");
  if (isResponse(c)) return c;

  const range = clampRetention(parseRange(req), c.user.plan);
  const view = req.nextUrl.searchParams.get("view") || "overview";

  if (view === "realtime") {
    const key = `rt|${id}`;
    const hit = cached(key, REALTIME_TTL);
    if (hit) return NextResponse.json(hit);
    const data = await stats.realtime(id);
    store(key, data);
    return NextResponse.json(data);
  }

  const snapped = {
    from: Math.floor(range.from / 60_000) * 60_000,
    to: Math.ceil(range.to / 60_000) * 60_000,
  };
  const key = `s|${id}|${snapped.from}|${snapped.to}`;
  const hit = cached(key, TTL);
  if (hit) {
    return NextResponse.json(hit, { headers: { "x-sidfast-cache": "hit" } });
  }

  const payload = await buildPayload(id, snapped);
  store(key, payload);
  return NextResponse.json(payload, { headers: { "x-sidfast-cache": "miss" } });
}

async function buildPayload(id: string, range: stats.Range) {
  const [
    funnelRows,
    overview,
    series,
    pages,
    referrers,
    sources,
    utmMedium,
    utmCampaign,
    countries,
    cities,
    browsers,
    platforms,
    devices,
    entry,
    exit,
    goals,
    payments,
    revenue,
    revenueLast,
  ] = await Promise.all([
    all<{ id: string; name: string; steps: string }>(
      "SELECT * FROM funnels WHERE website_id = ? ORDER BY created_at DESC",
      [id],
    ),
    stats.overview(id, range),
    stats.series(id, range),
    stats.breakdown(id, range, "path", 15),
    stats.breakdown(id, range, "referrer_source", 15),
    stats.breakdown(id, range, "utm_source", 15),
    stats.breakdown(id, range, "utm_medium", 15),
    stats.breakdown(id, range, "utm_campaign", 15),
    stats.breakdown(id, range, "country", 15),
    stats.breakdown(id, range, "city", 12),
    stats.breakdown(id, range, "browser", 10),
    stats.breakdown(id, range, "os", 10),
    stats.deviceBreakdown(id, range),
    stats.entryPages(id, range),
    stats.exitPages(id, range),
    stats.goalsStats(id, range),
    stats.paymentsList(id, range),
    stats.revenueBySource(id, range, "first"),
    stats.revenueBySource(id, range, "last"),
  ]);

  const funnels = await Promise.all(
    funnelRows.map((f) => buildFunnel(f, id, range)),
  );

  return {
    range,
    funnels,
    granularity: stats.granularityFor(range),
    overview,
    series,
    pages,
    referrers,
    sources,
    utmMedium,
    utmCampaign,
    countries,
    cities,
    browsers,
    platforms,
    devices,
    entry,
    exit,
    goals,
    payments,
    revenue,
    revenueLast,
  };
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
