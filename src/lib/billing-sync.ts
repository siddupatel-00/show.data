import { get } from "./db";
import type { User } from "./auth";
import { applySubscription, stripeClient, subPeriodEnd } from "./billing";

/**
 * Called right after Stripe Checkout returns. Stripe's webhook is usually
 * instant, but a manual pull keeps the plan flag correct either way.
 */
export async function syncAfterBilling(userId: string): Promise<void> {
  const s = stripeClient();
  if (!s) return;
  const user = await get<User>("SELECT * FROM users WHERE id = ?", [userId]);
  if (!user?.stripe_customer_id) return;

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
  } catch (e) {
    console.error("post-checkout sync failed", e);
  }
}
