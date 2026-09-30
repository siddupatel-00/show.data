import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { TopBar } from "@/components/top-bar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-bg text-fg">
      <TopBar
        email={user.email}
        plan={user.plan}
        hasCustomer={!!user.stripe_customer_id}
      />
      <main>{children}</main>
    </div>
  );
}
