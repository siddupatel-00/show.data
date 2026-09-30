import { all, get } from "./db";

export type Range = { from: number; to: number };
export type Granularity = "hour" | "day";

export type StatRow = {
  label: string;
  pageviews: number;
  visitors: number;
  revenue: number;
};

export type SeriesPoint = {
  t: number;
  label: string;
  pageviews: number;
  visitors: number;
  revenue: number;
};

export type Overview = {
  pageviews: number;
  visitors: number;
  visits: number;
  bounceRate: number;
  viewsPerVisit: number;
  revenue: number;
  payments: number;
  conversionRate: number;
  revenuePerVisitor: number;
  avgOrderValue: number;
  goals: number;
};

export function granularityFor(range: Range): Granularity {
  return range.to - range.from <= 3 * 86400_000 ? "hour" : "day";
}

function bucketKey(ts: number, g: Granularity): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  if (g === "hour")
    return `${y}-${m}-${day} ${String(d.getUTCHours()).padStart(2, "0")}`;
  return `${y}-${m}-${day}`;
}

function bucketStart(ts: number, g: Granularity): number {
  const d = new Date(ts);
  d.setUTCMinutes(0, 0, 0);
  if (g === "day") d.setUTCHours(0, 0, 0);
  return d.getTime();
}

function keys(g: Granularity): { sql: string; group: string } {
  return g === "hour"
    ? {
        sql: `strftime('%Y-%m-%d %H', created_at/1000, 'unixepoch')`,
        group: `strftime('%Y-%m-%d %H', created_at/1000, 'unixepoch')`,
      }
    : {
        sql: `strftime('%Y-%m-%d', created_at/1000, 'unixepoch')`,
        group: `strftime('%Y-%m-%d', created_at/1000, 'unixepoch')`,
      };
}

export async function overview(siteId: string, range: Range): Promise<Overview> {
  const base = { website: siteId, from: range.from, to: range.to };

  const pv = await get<{ c: number; v: number; s: number }>(
    `SELECT COUNT(*) c, COUNT(DISTINCT visitor_id) v, COUNT(DISTINCT session_id) s
     FROM events WHERE website_id=@website AND type='pageview'
     AND created_at>=@from AND created_at<@to`,
    base,
  );
  const bounced = await get<{ c: number }>(
    `SELECT COUNT(*) c FROM (
       SELECT session_id FROM events WHERE website_id=@website AND type='pageview'
       AND created_at>=@from AND created_at<@to
       GROUP BY session_id HAVING COUNT(*)=1)`,
    base,
  );
  const rev = await get<{ revenue: number; payments: number }>(
    `SELECT COALESCE(SUM(amount),0) revenue, COUNT(*) payments
     FROM events WHERE website_id=@website AND type='payment'
     AND created_at>=@from AND created_at<@to`,
    base,
  );
  const goalVisitors = await get<{ c: number }>(
    `SELECT COUNT(DISTINCT visitor_id) c FROM events
     WHERE website_id=@website AND type IN ('goal','payment')
     AND created_at>=@from AND created_at<@to`,
    base,
  );

  const pageviews = pv?.c ?? 0;
  const visitors = pv?.v ?? 0;
  const visits = pv?.s ?? 0;
  const revenue = rev?.revenue ?? 0;
  const payments = rev?.payments ?? 0;
  const goalVis = goalVisitors?.c ?? 0;

  return {
    pageviews,
    visitors,
    visits,
    bounceRate: visits ? (bounced?.c ?? 0) / visits : 0,
    viewsPerVisit: visits ? pageviews / visits : 0,
    revenue,
    payments,
    conversionRate: visitors ? Math.min(1, goalVis / visitors) : 0,
    revenuePerVisitor: visitors ? revenue / visitors : 0,
    avgOrderValue: payments ? revenue / payments : 0,
    goals: goalVis,
  };
}

export async function series(
  siteId: string,
  range: Range,
): Promise<SeriesPoint[]> {
  const g = granularityFor(range);
  const { sql, group } = keys(g);

  const pv = await all<{ k: string; pageviews: number; visitors: number }>(
    `SELECT ${sql} k, COUNT(*) pageviews, COUNT(DISTINCT visitor_id) visitors
     FROM events WHERE website_id=? AND type='pageview'
     AND created_at>=? AND created_at<? GROUP BY ${group}`,
    [siteId, range.from, range.to],
  );

  const rev = await all<{ k: string; revenue: number }>(
    `SELECT ${sql} k, COALESCE(SUM(amount),0) revenue
     FROM events WHERE website_id=? AND type='payment'
     AND created_at>=? AND created_at<? GROUP BY ${group}`,
    [siteId, range.from, range.to],
  );

  const map = new Map<string, SeriesPoint>();
  const start = bucketStart(range.from, g);
  const step = g === "hour" ? 3600_000 : 86400_000;
  const end = bucketStart(range.to - 1, g);
  for (let t = start; t <= end; t += step) {
    const k = bucketKey(t, g);
    map.set(k, { t, label: k, pageviews: 0, visitors: 0, revenue: 0 });
  }
  for (const r of pv) {
    const p = map.get(r.k);
    if (p) {
      p.pageviews = r.pageviews;
      p.visitors = r.visitors;
    }
  }
  for (const r of rev) {
    const p = map.get(r.k);
    if (p) p.revenue = r.revenue;
  }
  return [...map.values()];
}

const COLUMNS = new Set([
  "path",
  "referrer",
  "referrer_source",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "country",
  "region",
  "city",
  "browser",
  "os",
  "device",
  "screen",
]);

export async function breakdown(
  siteId: string,
  range: Range,
  column: string,
  limit = 12,
): Promise<StatRow[]> {
  if (!COLUMNS.has(column)) throw new Error("invalid breakdown column");

  const passthrough = column === "referrer_source";
  const expr = passthrough
    ? `CASE WHEN referrer_source='' THEN 'Direct' ELSE referrer_source END`
    : column === "utm_source" || column === "utm_medium"
      ? `CASE WHEN ${column}='' THEN '(none)' ELSE ${column} END`
      : column;
  const whereNonEmpty = passthrough ? "" : ` AND ${column} <> ''`;

  const rows = await all<StatRow>(
    `SELECT ${expr} label,
            COUNT(*) pageviews,
            COUNT(DISTINCT visitor_id) visitors
     FROM events
     WHERE website_id=? AND type='pageview'
       AND created_at>=? AND created_at<?${whereNonEmpty}
     GROUP BY label ORDER BY pageviews DESC LIMIT ?`,
    [siteId, range.from, range.to, limit],
  );

  const pay = await all<{ label: string; revenue: number }>(
    `SELECT ${expr} label, COALESCE(SUM(amount),0) revenue
     FROM events
     WHERE website_id=? AND type='payment'
       AND created_at>=? AND created_at<?${whereNonEmpty}
     GROUP BY label`,
    [siteId, range.from, range.to],
  );

  const revMap = new Map(pay.map((p) => [p.label, p.revenue]));
  return rows.map((r) => ({ ...r, revenue: revMap.get(r.label) ?? 0 }));
}

export async function deviceBreakdown(siteId: string, range: Range) {
  return all<StatRow>(
    `SELECT device label, COUNT(*) pageviews, COUNT(DISTINCT visitor_id) visitors
     FROM events WHERE website_id=? AND type='pageview'
     AND created_at>=? AND created_at<? AND device <> ''
     GROUP BY device ORDER BY visitors DESC`,
    [siteId, range.from, range.to],
  );
}

export async function entryPages(siteId: string, range: Range, limit = 10) {
  return all<{ label: string; visitors: number }>(
    `SELECT path label, COUNT(*) visitors FROM (
       SELECT path, ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at) rn
       FROM events WHERE website_id=? AND type='pageview'
         AND created_at>=? AND created_at<?
     ) WHERE rn=1 GROUP BY path ORDER BY visitors DESC LIMIT ?`,
    [siteId, range.from, range.to, limit],
  );
}

export async function exitPages(siteId: string, range: Range, limit = 10) {
  return all<{ label: string; visitors: number }>(
    `SELECT path label, COUNT(*) visitors FROM (
       SELECT path, ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at DESC) rn
       FROM events WHERE website_id=? AND type='pageview'
         AND created_at>=? AND created_at<?
     ) WHERE rn=1 GROUP BY path ORDER BY visitors DESC LIMIT ?`,
    [siteId, range.from, range.to, limit],
  );
}

export async function goalsStats(siteId: string, range: Range) {
  const visitorsRow = await get<{ c: number }>(
    `SELECT COUNT(DISTINCT visitor_id) c FROM events
     WHERE website_id=? AND type='pageview' AND created_at>=? AND created_at<?`,
    [siteId, range.from, range.to],
  );
  const visitors = visitorsRow?.c ?? 0;

  const rows = await all<{
    label: string;
    conversions: number;
    visitors: number;
    revenue: number;
  }>(
    `SELECT goal_name label, COUNT(*) conversions, COUNT(DISTINCT visitor_id) visitors,
            COALESCE(SUM(amount),0) revenue
     FROM events WHERE website_id=? AND type IN ('goal','payment')
       AND created_at>=? AND created_at<? AND goal_name <> ''
     GROUP BY goal_name ORDER BY conversions DESC`,
    [siteId, range.from, range.to],
  );

  return {
    totalVisitors: visitors,
    goals: rows.map((r) => ({
      ...r,
      rate: visitors ? r.visitors / visitors : 0,
    })),
  };
}

export async function paymentsList(siteId: string, range: Range, limit = 50) {
  return all<{
    created_at: number;
    amount: number;
    currency: string;
    customer_email: string;
    goal_name: string;
    first_source: string;
    first_referrer: string;
    first_campaign: string;
    last_source: string;
    last_referrer: string;
    path: string;
    country: string;
    metadata: string;
  }>(
    `SELECT created_at, amount, currency, customer_email, goal_name,
            first_source, first_referrer, first_campaign, last_source, last_referrer,
            path, country, metadata
     FROM events WHERE website_id=? AND type='payment'
       AND created_at>=? AND created_at<? ORDER BY created_at DESC LIMIT ?`,
    [siteId, range.from, range.to, limit],
  );
}

export async function revenueBySource(
  siteId: string,
  range: Range,
  by: "first" | "last",
) {
  const source = by === "first" ? "first_source" : "last_source";
  const referrer = by === "first" ? "first_referrer" : "last_referrer";

  const bySource = await all<{
    label: string;
    revenue: number;
    payments: number;
    visitors: number;
  }>(
    `SELECT CASE WHEN ${source}='' THEN 'Direct' ELSE ${source} END label,
            COALESCE(SUM(amount),0) revenue, COUNT(*) payments,
            COUNT(DISTINCT visitor_id) visitors
     FROM events WHERE website_id=? AND type='payment'
       AND created_at>=? AND created_at<? GROUP BY label ORDER BY revenue DESC LIMIT 15`,
    [siteId, range.from, range.to],
  );

  const byReferrer = await all<{
    label: string;
    revenue: number;
    payments: number;
  }>(
    `SELECT CASE WHEN ${referrer}='' THEN 'Direct' ELSE ${referrer} END label,
            COALESCE(SUM(amount),0) revenue, COUNT(*) payments
     FROM events WHERE website_id=? AND type='payment'
       AND created_at>=? AND created_at<? GROUP BY label ORDER BY revenue DESC LIMIT 15`,
    [siteId, range.from, range.to],
  );

  return { bySource, byReferrer };
}

export async function realtime(siteId: string, minutes = 5) {
  const since = Date.now() - minutes * 60_000;

  const totals = await get<{ pageviews: number; visitors: number }>(
    `SELECT COUNT(*) pageviews, COUNT(DISTINCT visitor_id) visitors FROM events
     WHERE website_id=? AND type='pageview' AND created_at>=?`,
    [siteId, since],
  );

  const pages = await all<{ label: string; pageviews: number; last_seen: number }>(
    `SELECT path label, COUNT(*) pageviews, MAX(created_at) last_seen FROM events
     WHERE website_id=? AND type='pageview' AND created_at>=?
     GROUP BY path ORDER BY last_seen DESC LIMIT 10`,
    [siteId, since],
  );

  const sources = await all<{ label: string; pageviews: number; last_seen: number }>(
    `SELECT CASE WHEN referrer_source='' THEN 'Direct' ELSE referrer_source END label,
            COUNT(*) pageviews, MAX(created_at) last_seen
     FROM events WHERE website_id=? AND type='pageview' AND created_at>=?
     GROUP BY label ORDER BY last_seen DESC LIMIT 8`,
    [siteId, since],
  );

  const recent = await all<{
    type: string;
    path: string;
    referrer_source: string;
    country: string;
    device: string;
    browser: string;
    amount: number;
    created_at: number;
  }>(
    `SELECT type, path, referrer_source, country, device, browser, amount, created_at
     FROM events WHERE website_id=? AND created_at>=?
     ORDER BY created_at DESC LIMIT 25`,
    [siteId, since],
  );

  return {
    pageviews: totals?.pageviews ?? 0,
    visitors: totals?.visitors ?? 0,
    pages,
    sources,
    recent,
  };
}

export type FunnelStep = { name: string; kind: "path" | "goal"; value: string };

async function stepVisitorTimes(
  siteId: string,
  range: Range,
  step: FunnelStep,
): Promise<Map<string, number>> {
  const rows =
    step.kind === "path"
      ? await all<{ visitor_id: string; t: number }>(
          `SELECT visitor_id, MIN(created_at) t FROM events
           WHERE website_id=? AND type='pageview' AND created_at>=? AND created_at<?
             AND path LIKE ? GROUP BY visitor_id`,
          [siteId, range.from, range.to, `%${step.value}%`],
        )
      : await all<{ visitor_id: string; t: number }>(
          `SELECT visitor_id, MIN(created_at) t FROM events
           WHERE website_id=? AND type IN ('goal','payment')
             AND created_at>=? AND created_at<? AND goal_name = ?
           GROUP BY visitor_id`,
          [siteId, range.from, range.to, step.value],
        );
  return new Map(rows.map((r) => [r.visitor_id, r.t]));
}

export async function funnelStats(
  siteId: string,
  range: Range,
  steps: FunnelStep[],
) {
  if (!steps.length) return [];
  const maps: Map<string, number>[] = [];
  for (const s of steps) maps.push(await stepVisitorTimes(siteId, range, s));

  const result: { name: string; visitors: number; rate: number }[] = [];
  let current: Set<string> | null = null;
  let prevTime: Map<string, number> | null = null;

  for (let i = 0; i < steps.length; i++) {
    const times = maps[i];
    if (i === 0) {
      current = new Set(times.keys());
      prevTime = times;
    } else {
      const next = new Set<string>();
      for (const v of current ?? []) {
        const t = times.get(v);
        if (t !== undefined && prevTime && t >= (prevTime.get(v) ?? 0))
          next.add(v);
      }
      current = next;
      const merged: Map<string, number> = new Map(prevTime ?? []);
      for (const [k, v] of times) merged.set(k, v);
      prevTime = merged;
    }
    result.push({ name: steps[i].name, visitors: current.size, rate: 0 });
  }

  const first = result[0]?.visitors || 0;
  return result.map((r) => ({
    ...r,
    rate: first ? r.visitors / first : 0,
  }));
}
