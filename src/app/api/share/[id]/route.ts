import { NextRequest, NextResponse } from "next/server";
import { getSiteByShareId } from "@/lib/sites";
import { parseRange, clampRetention } from "@/lib/range";
import * as stats from "@/lib/stats";
import { get } from "@/lib/db";
import type { Plan } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const site = await getSiteByShareId(id);
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const owner = await get<{ plan: Plan }>(
    "SELECT plan FROM users WHERE id = ?",
    [site.owner_id],
  );
  const range = clampRetention(parseRange(req), owner?.plan ?? "free");
  const view = req.nextUrl.searchParams.get("view");
  if (view === "realtime") return NextResponse.json(await stats.realtime(site.id));

  return NextResponse.json({
    site: { name: site.name, domain: site.domain },
    range,
    granularity: stats.granularityFor(range),
    overview: await stats.overview(site.id, range),
    series: await stats.series(site.id, range),
    pages: await stats.breakdown(site.id, range, "path", 15),
    referrers: await stats.breakdown(site.id, range, "referrer_source", 15),
    countries: await stats.breakdown(site.id, range, "country", 12),
    devices: stats.deviceBreakdown(site.id, range),
    sources: await stats.breakdown(site.id, range, "utm_source", 12),
  });
}
