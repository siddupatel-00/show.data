import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { get, run } from "./db";

const WMA = "https://www.googleapis.com/webmasters/v3";
const OAUTH = "https://oauth2.googleapis.com/token";
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "email",
].join(" ");

type Integration = {
  id: string;
  user_id: string;
  website_id: string;
  provider: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  meta: string;
};

export function googleConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
}

export function redirectUri(): string {
  if (process.env.GOOGLE_REDIRECT_URI)
    return process.env.GOOGLE_REDIRECT_URI;
  const base = process.env.APP_URL || "http://localhost:3000";
  return `${base}/api/integrations/google/callback`;
}

/* --------------------------- state signing --------------------------- */

function secret(): string {
  return (
    process.env.APP_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    "sidfast-dev-secret"
  );
}

export function signState(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", secret()).update(body).digest("base64url")}`;
}

export function readState(
  state: string,
): { userId: string; siteId: string } | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof parsed.userId !== "string" || typeof parsed.siteId !== "string")
      return null;
    if (typeof parsed.exp !== "number" || parsed.exp < Date.now()) return null;
    return { userId: parsed.userId, siteId: parsed.siteId };
  } catch {
    return null;
  }
}

export function newState(userId: string, siteId: string): string {
  return signState({
    userId,
    siteId,
    exp: Date.now() + 10 * 60_000,
    nonce: randomBytes(8).toString("hex"),
  });
}

export function authUrl(userId: string, siteId: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state: newState(userId, siteId),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

/* ----------------------------- tokens ------------------------------- */

async function exchange(body: Record<string, string>) {
  const res = await fetch(OAUTH, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      ...body,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description || json.error || "token exchange failed");
  return json as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
}

export async function exchangeCode(code: string) {
  return exchange({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
}

export async function saveIntegration(
  userId: string,
  siteId: string,
  tokens: { access_token: string; refresh_token?: string; expires_in?: number },
  meta: Record<string, unknown> = {},
): Promise<void> {
  await run(
    `INSERT INTO integrations (id, user_id, website_id, provider, access_token, refresh_token, expires_at, meta, created_at)
     VALUES (?, ?, ?, 'google', ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, provider, website_id) DO UPDATE SET
       access_token = excluded.access_token,
       refresh_token = CASE WHEN excluded.refresh_token = '' THEN integrations.refresh_token ELSE excluded.refresh_token END,
       expires_at = excluded.expires_at,
       meta = excluded.meta`,
    [
      `ig_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      userId,
      siteId,
      tokens.access_token,
      tokens.refresh_token || "",
      Date.now() + (tokens.expires_in || 3600) * 1000,
      JSON.stringify(meta),
      Date.now(),
    ],
  );
}

export async function getIntegration(
  userId: string,
  siteId: string,
): Promise<Integration | undefined> {
  return get<Integration>(
    "SELECT * FROM integrations WHERE user_id = ? AND provider = 'google' AND website_id = ?",
    [userId, siteId],
  );
}

/** Returns a live access token, refreshing and persisting when expired. */
export async function accessToken(integration: Integration): Promise<string> {
  if (integration.expires_at - Date.now() > 60_000 && integration.access_token)
    return integration.access_token;
  if (!integration.refresh_token) return integration.access_token;

  const tokens = await exchange({
    refresh_token: integration.refresh_token,
    grant_type: "refresh_token",
  });
  await run(
    "UPDATE integrations SET access_token = ?, expires_at = ? WHERE id = ?",
    [
      tokens.access_token,
      Date.now() + (tokens.expires_in || 3600) * 1000,
      integration.id,
    ],
  );
  return tokens.access_token;
}

export async function disconnect(userId: string, siteId: string) {
  await run(
    "DELETE FROM integrations WHERE user_id = ? AND provider = 'google' AND website_id = ?",
    [userId, siteId],
  );
}

/* ---------------------------- Search Console ------------------------- */

async function gsc(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<any> {
  const res = await fetch(`${WMA}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.error?.message || `Search Console ${res.status}`;
    const err = new Error(message) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return json;
}

/** Candidate property URLs, domain property first. */
export function propertyCandidates(domain: string): string[] {
  const d = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
  return [`sc-domain:${d}`, `https://${d}/`, `https://www.${d}/`];
}

export async function pickProperty(
  token: string,
  domain: string,
): Promise<string | null> {
  try {
    const list = await gsc(token, "/sites");
    const owned = new Set<string>(
      (list.siteEntry || []).map((s: { siteUrl: string }) =>
        s.siteUrl.replace(/\/+$/, ""),
      ),
    );
    for (const candidate of propertyCandidates(domain)) {
      if (owned.has(candidate.replace(/\/+$/, ""))) return candidate;
    }
  } catch (e) {
    if ((e as { status?: number }).status !== 401) {
      // Fall through: some accounts return a partial list; still try candidates.
    }
  }
  for (const candidate of propertyCandidates(domain)) {
    try {
      await gsc(token, `/sites/${encodeURIComponent(candidate)}`);
      return candidate;
    } catch {
      /* try the next shape */
    }
  }
  return null;
}

export type SeoDimension = "query" | "page" | "country" | "device";

export type SeoRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export async function searchAnalytics(args: {
  token: string;
  property: string;
  from: Date;
  to: Date;
  dimensions: SeoDimension[];
  limit?: number;
}): Promise<SeoRow[]> {
  const json = await gsc(
    args.token,
    `/sites/${encodeURIComponent(args.property)}/searchAnalytics/query`,
    {
      method: "POST",
      body: JSON.stringify({
        startDate: day(args.from),
        endDate: day(args.to),
        dimensions: args.dimensions,
        rowLimit: args.limit || 50,
        dimensionFilterGroups: [],
      }),
    },
  );
  return (json.rows || []) as SeoRow[];
}

function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}
