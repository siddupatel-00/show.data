import { all, get, run } from "./db";
import type { Website } from "./sites";
import {
  firstTouchLabel,
  geoFromHeaders,
  isBot,
  parseUserAgent,
  referrerSource,
} from "./parse";

export type PageviewPayload = {
  visitor_id?: string;
  session_id?: string;
  path?: string;
  title?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  screen?: string;
  goal?: string;
  meta?: Record<string, unknown>;
};

export type PaymentPayload = {
  visitor_id?: string;
  session_id?: string;
  amount: number;
  currency?: string;
  email?: string;
  goal?: string;
  path?: string;
  meta?: Record<string, unknown>;
  timestamp?: number;
};

function clean(s: unknown, max = 512): string {
  if (typeof s !== "string") return "";
  return s.slice(0, max);
}

export async function insertEvent(e: Record<string, unknown>) {
  const cols = Object.keys(e);
  await run(
    `INSERT INTO events (${cols.join(",")}) VALUES (${cols
      .map((c) => `@${c}`)
      .join(",")})`,
    e,
  );
}

export async function recordPageview(
  site: Website,
  p: PageviewPayload,
  headers: Headers,
) {
  const ua = headers.get("user-agent") || "";
  if (isBot(ua)) return { ok: true, ignored: "bot" };

  const { browser, os, device } = parseUserAgent(ua);
  const geo = geoFromHeaders(headers);
  const referrer = clean(p.referrer, 1024);
  const source = referrerSource(referrer, site.domain);
  const visitorId = clean(p.visitor_id, 64) || "unknown";
  const now = Date.now();

  const base = {
    website_id: site.id,
    visitor_id: visitorId,
    session_id: clean(p.session_id, 64) || visitorId,
    path: clean(p.path, 1024) || "/",
    title: clean(p.title, 256),
    referrer,
    referrer_source: source,
    utm_source: clean(p.utm_source, 128),
    utm_medium: clean(p.utm_medium, 128),
    utm_campaign: clean(p.utm_campaign, 128),
    utm_term: clean(p.utm_term, 128),
    utm_content: clean(p.utm_content, 128),
    country: geo.country,
    region: geo.region,
    city: geo.city,
    browser,
    os,
    device,
    screen: clean(p.screen, 32),
    created_at: now,
  };

  await insertEvent({ ...base, type: "pageview", goal_name: "", metadata: "" });
  return { ok: true };
}

export async function recordGoal(
  site: Website,
  p: PageviewPayload,
  headers: Headers,
) {
  const ua = headers.get("user-agent") || "";
  if (isBot(ua)) return { ok: true, ignored: "bot" };
  const { browser, os, device } = parseUserAgent(ua);
  const geo = geoFromHeaders(headers);
  const visitorId = clean(p.visitor_id, 64) || "unknown";
  const name = clean(p.goal, 128);
  if (!name) return { ok: false, error: "missing goal name" };
  await upsertGoal(site.id, name);

  await insertEvent({
    website_id: site.id,
    visitor_id: visitorId,
    session_id: clean(p.session_id, 64) || visitorId,
    type: "goal",
    path: clean(p.path, 1024) || "/",
    title: clean(p.title, 256),
    referrer: "",
    referrer_source: referrerSource(clean(p.referrer, 1024), site.domain),
    utm_source: clean(p.utm_source, 128),
    utm_medium: clean(p.utm_medium, 128),
    utm_campaign: clean(p.utm_campaign, 128),
    utm_term: clean(p.utm_term, 128),
    utm_content: clean(p.utm_content, 128),
    goal_name: name,
    country: geo.country,
    region: geo.region,
    city: geo.city,
    browser,
    os,
    device,
    screen: clean(p.screen, 32),
    metadata: JSON.stringify(p.meta ?? {}),
    created_at: Date.now(),
  });
  return { ok: true };
}

type Touch = {
  referrer_source: string;
  utm_source: string;
  utm_campaign: string;
};

async function touchpoints(siteId: string, visitorId: string, before: number) {
  const first = await get<Touch>(
    `SELECT referrer_source, utm_source, utm_campaign FROM events
     WHERE website_id=? AND visitor_id=? AND type='pageview' AND created_at<=?
     ORDER BY created_at ASC LIMIT 1`,
    [siteId, visitorId, before],
  );
  const last = await get<Touch>(
    `SELECT referrer_source, utm_source, utm_campaign FROM events
     WHERE website_id=? AND visitor_id=? AND type='pageview' AND created_at<=?
     ORDER BY created_at DESC LIMIT 1`,
    [siteId, visitorId, before],
  );
  return { first, last };
}

export async function recordPayment(
  site: Website,
  p: PaymentPayload,
  headers: Headers,
) {
  const ua = headers.get("user-agent") || "";
  const { browser, os, device } = parseUserAgent(ua);
  const geo = geoFromHeaders(headers);
  const visitorId = clean(p.visitor_id, 64) || "unknown";
  const at = p.timestamp && p.timestamp > 0 ? p.timestamp : Date.now();
  const amount = Number(p.amount);
  if (!Number.isFinite(amount)) return { ok: false, error: "invalid amount" };

  const t = await touchpoints(site.id, visitorId, at);
  const ft = firstTouchLabel(
    t.first?.utm_source || "",
    t.first?.referrer_source || "",
    "",
  );
  const lastLabel = t.last
    ? firstTouchLabel(t.last.utm_source || "", t.last.referrer_source || "", "")
    : { source: "Direct", referrer: "" };

  const goalName = clean(p.goal, 128) || "purchase";
  await upsertGoal(site.id, goalName);

  await insertEvent({
    website_id: site.id,
    visitor_id: visitorId,
    session_id: clean(p.session_id, 64) || visitorId,
    type: "payment",
    path: clean(p.path, 1024) || "/",
    title: "",
    referrer: "",
    referrer_source: lastLabel.referrer,
    utm_source: ft.source,
    utm_medium: "",
    utm_campaign: t.first?.utm_campaign || "",
    utm_term: "",
    utm_content: "",
    goal_name: goalName,
    country: geo.country,
    region: geo.region,
    city: geo.city,
    browser,
    os,
    device,
    screen: "",
    amount,
    currency: clean(p.currency, 8) || "USD",
    customer_email: clean(p.email, 256),
    first_source: ft.source,
    first_referrer: ft.referrer,
    first_campaign: t.first?.utm_campaign || "",
    last_source: lastLabel.source,
    last_referrer: lastLabel.referrer,
    metadata: JSON.stringify(p.meta ?? {}),
    is_bot: 0,
    created_at: at,
  });

  return { ok: true };
}

export async function upsertGoal(websiteId: string, name: string) {
  if (!name) return;
  const exists = await get(
    "SELECT id FROM goals WHERE website_id = ? AND name = ?",
    [websiteId, name],
  );
  if (exists) return;
  await run(
    "INSERT INTO goals (id, website_id, name, created_at) VALUES (?, ?, ?, ?)",
    [
      `g_${websiteId}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      websiteId,
      name,
      Date.now(),
    ],
  );
}

export async function listGoals(websiteId: string) {
  return all<{ id: string; name: string; created_at: number }>(
    "SELECT * FROM goals WHERE website_id = ? ORDER BY created_at DESC",
    [websiteId],
  );
}
