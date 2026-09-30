import { NextResponse } from "next/server";
import { isResponse, requireUser } from "@/lib/guard";
import { applySubscription, stripeClient, subPeriodEnd } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pull the customer's live subscriptions from Stripe straight after checkout.
 * Covers the window where the webhook has not landed yet.
 */
export async function POST() {
  const s = stripeClient();
  if (!s)
    return NextResponse.json(
      { error: "Billing is not configured on this deployment" },
      { status: 503 },
    );
  const user = await requireUser();
  if (isResponse(user)) return user;
  if (!user.stripe_customer_id)
    return NextResponse.json({ error: "No billing account" }, { status: 400 });

  try {
    const list = await s.subscriptions.list({
      customer: user.stripe_customer_id,
      status: "all",
      limit: 20,
    });
    for (const sub of list.data) {
      await applySubscription({
        provider: "stripe",
        externalId: sub.id,
        status: String(sub.status),
        periodEnd: subPeriodEnd(sub as unknown as Record<string, any>),
        userId: user.id,
        email: user.email,
      });
    }
    const fresh = await import("@/lib/auth").then((m) => m.getCurrentUser());
    return NextResponse.json({
      synced: list.data.length,
      plan: fresh?.plan ?? user.plan,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 502 },
    );
  }
}
