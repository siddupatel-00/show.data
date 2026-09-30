import { listSitesForUser } from "@/lib/sites";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SitesView } from "@/components/sites-view";
import { syncAfterBilling } from "@/lib/billing-sync";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[]>> };

export default async function DashboardPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const q = await searchParams;
  if (q.billing === "success") {
    await syncAfterBilling(user.id);
    redirect("/dashboard");
  }

  const rows = await listSitesForUser(user.id);
  const sites = rows.map((s) => ({
    id: s.id,
    name: s.name,
    domain: s.domain,
    role: s.role,
    pageviews: s.pageviews,
    visitors: s.visitors,
    revenue: s.revenue,
  }));
  return <SitesView sites={sites} />;
}
