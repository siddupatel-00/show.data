import { all, get, run } from "./db";
import { shortId, token } from "./ids";

export type Website = {
  id: string;
  owner_id: string;
  name: string;
  domain: string;
  token: string;
  share_id: string;
  created_at: number;
};

export type Role = "owner" | "editor" | "viewer";

export async function listSitesForUser(userId: string): Promise<
  (Website & {
    role: Role;
    pageviews: number;
    visitors: number;
    revenue: number;
  })[]
> {
  const since = Date.now() - 30 * 86400_000;
  return all(
    `SELECT w.*,
            CASE WHEN w.owner_id = ? THEN 'owner' ELSE m.role END role,
            COALESCE(s.pageviews, 0) pageviews,
            COALESCE(s.visitors, 0) visitors,
            COALESCE(r.revenue, 0) revenue
     FROM websites w
     LEFT JOIN website_members m ON m.website_id = w.id AND m.user_id = ?
     LEFT JOIN (
       SELECT website_id,
              COUNT(*) pageviews,
              COUNT(DISTINCT visitor_id) visitors
       FROM events WHERE type='pageview' AND created_at >= ?
       GROUP BY website_id
     ) s ON s.website_id = w.id
     LEFT JOIN (
       SELECT website_id, COALESCE(SUM(amount),0) revenue
       FROM events WHERE type='payment' AND created_at >= ?
       GROUP BY website_id
     ) r ON r.website_id = w.id
     WHERE w.owner_id = ? OR m.user_id IS NOT NULL
     ORDER BY w.created_at DESC`,
    [userId, userId, since, since, userId],
  );
}

export async function getSite(id: string): Promise<Website | undefined> {
  return get<Website>("SELECT * FROM websites WHERE id = ?", [id]);
}

export async function getSiteByShareId(
  shareId: string,
): Promise<Website | undefined> {
  return get<Website>("SELECT * FROM websites WHERE share_id = ?", [shareId]);
}

export async function getSiteByToken(
  tok: string,
): Promise<Website | undefined> {
  return get<Website>("SELECT * FROM websites WHERE token = ?", [tok]);
}

export async function roleFor(
  site: Website,
  userId: string,
): Promise<Role | null> {
  if (site.owner_id === userId) return "owner";
  const row = await get<{ role: Role }>(
    "SELECT role FROM website_members WHERE website_id = ? AND user_id = ?",
    [site.id, userId],
  );
  return row?.role ?? null;
}

export async function createSite(
  ownerId: string,
  name: string,
  domain: string,
): Promise<Website> {
  const site: Website = {
    id: shortId(16),
    owner_id: ownerId,
    name,
    domain: normalizeDomain(domain),
    token: `s_${token(12)}`,
    share_id: shortId(16),
    created_at: Date.now(),
  };
  await run(
    `INSERT INTO websites (id, owner_id, name, domain, token, share_id, created_at)
     VALUES (@id, @owner_id, @name, @domain, @token, @share_id, @created_at)`,
    site as unknown as Record<string, unknown>,
  );
  return site;
}

export function normalizeDomain(domain: string): string {
  let d = (domain || "").trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "");
  d = d.split("/")[0].split(":")[0];
  return d;
}

export async function membersOf(siteId: string) {
  return all<{
    id: string;
    email: string;
    name: string;
    role: Role;
  }>(
    `SELECT u.id, u.email, u.name, 'owner' AS role
     FROM websites w JOIN users u ON u.id = w.owner_id
     WHERE w.id = ?
     UNION ALL
     SELECT u.id, u.email, u.name, m.role
     FROM website_members m JOIN users u ON u.id = m.user_id
     WHERE m.website_id = ?`,
    [siteId, siteId],
  );
}
