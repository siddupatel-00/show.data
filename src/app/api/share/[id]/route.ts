import { NextRequest, NextResponse } from "next/server";
import { getSiteByShareId } from "@/lib/sites";
import { parseRange, clampRetention } from "@/lib/range";
import * as stats from "@/lib/stats";
import { get } from "@/lib/db";
import { withTiming, startedAt } from "@/lib/timing";
import type { Plan } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const t0 = startedAt();
  const { id } = await ctx.params;
  const site = await getSiteByShareId(id);
  if (!site)
    return withTiming(
      NextResponse.json({ error: "Not found" }, { status: 404 }),
      t0,
    );

  const owner = await get<{ plan: Plan }>(
    "SELECT plan FROM users WHERE id = ?",
    [site.owner_id],
  );
  const range = clampRetention(parseRange(req), owner?.plan ?? "free");
  const view = req.nextUrl.searchParams.get("view");
  if (view === "realtime")
    return withTiming(
      NextResponse.json(await stats.realtime(site.id)),
      t0,
    );

  const [overview, series, pages, referrers, countries, devices, sources] =
    await Promise.all([
      stats.overview(site.id, range),
      stats.series(site.id, range),
      stats.breakdown(site.id, range, "path", 15),
      stats.breakdown(site.id, range, "referrer_source", 15),
      stats.breakdown(site.id, range, "country", 12),
      stats.deviceBreakdown(site.id, range),
      stats.breakdown(site.id, range, "utm_source", 12),
    ]);

  return withTiming(
    NextResponse.json({
      site: { name: site.name, domain: site.domain },
      range,
      granularity: stats.granularityFor(range),
      overview,
      series,
      pages,
      referrers,
      countries,
      devices,
      sources,
    }),
    t0,
  );
}
