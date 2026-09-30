import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getSite, membersOf, roleFor } from "@/lib/sites";
import { all } from "@/lib/db";
import { SiteDashboard, type SiteInfo } from "@/components/site-dashboard";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ site: string }> };

export default async function SitePage({ params }: Params) {
  const { site: siteId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const site = await getSite(siteId);
  if (!site) notFound();
  const role = await roleFor(site, user.id);
  if (!role) redirect("/dashboard");

  const goals = await all<SiteInfo["goals"][number]>(
    "SELECT * FROM goals WHERE website_id = ? ORDER BY created_at DESC",
    [siteId],
  );
  const funnels = await all<SiteInfo["funnels"][number]>(
    "SELECT * FROM funnels WHERE website_id = ? ORDER BY created_at DESC",
    [siteId],
  );

  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || "http";
  const origin = `${proto}://${host}`;

  const info: SiteInfo = {
    id: site.id,
    name: site.name,
    domain: site.domain,
    token: site.token,
    shareId: site.share_id,
    role,
    origin,
    goals,
    funnels,
    members: await membersOf(siteId),
    plan: user.plan,
  };

  return <SiteDashboard site={info} />;
}
