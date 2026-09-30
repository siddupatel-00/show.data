import { NextRequest, NextResponse } from "next/server";
import { get, run } from "@/lib/db";
import { applySubscription, proPriceId, stripeClient, subPeriodEnd } from "@/lib/billing";
import { verifyStripe } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UserRow = { id: string; email: string };

type SubObject = {
  id?: string;
  status?: string;
  customer?: string | { id?: string } | null;
  metadata?: Record<string, string> | null;
  current_period_end?: number;
  items?: { data?: Array<{ price?: { id?: string } }> };
};

async function userFor(sub: SubObject): Promise<UserRow | null> {
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id || "";
  const metaUserId = sub.metadata?.userId;
  if (metaUserId) {
    const byId = await get<UserRow>(
      "SELECT id, email FROM users WHERE id = ?",
      [metaUserId],
    );
    if (byId) return byId;
  }
  if (customerId) {
    const byCustomer = await get<UserRow>(
      "SELECT id, email FROM users WHERE stripe_customer_id = ?",
      [customerId],
    );
    if (byCustomer) return byCustomer;
  }
  if (customerId) {
    const customer = await stripeClient()?.customers.retrieve(customerId);
    const email = customer && !customer.deleted ? customer.email : null;
    if (email) {
      const byEmail = await get<UserRow>(
        "SELECT id, email FROM users WHERE email = ?",
        [email.toLowerCase()],
      );
      if (byEmail) return byEmail;
    }
  }
  return null;
}

function isProPrice(sub: SubObject): boolean {
  const wanted = proPriceId();
  if (!wanted) return true;
  return sub.items?.data?.[0]?.price?.id === wanted;
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret)
    return NextResponse.json(
      { error: "Stripe webhook secret not configured" },
      { status: 503 },
    );

  const raw = await req.text();
  if (!verifyStripe(raw, req.headers.get("stripe-signature"), secret))
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });

  let event: { type?: string; data?: { object?: SubObject & Record<string, unknown> } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  const type = event.type || "";
  const obj = (event.data?.object ?? {}) as SubObject & Record<string, unknown>;

  try {
    if (type === "checkout.session.completed") {
      const user = await userFor(obj);
      if (user && typeof obj.customer === "string") {
        await run("UPDATE users SET stripe_customer_id = ? WHERE id = ?", [
          obj.customer,
          user.id,
        ]);
      }
      if (user && obj.subscription) {
        await applySubscription({
          provider: "stripe",
          externalId: String(obj.subscription),
          status: "active",
          userId: user.id,
          email: user.email,
        });
      }
    } else if (type.startsWith("customer.subscription.")) {
      const user = await userFor(obj);
      if (user && isProPrice(obj)) {
        const status =
          type === "customer.subscription.deleted"
            ? "canceled"
            : String(obj.status || "active");
        await applySubscription({
          provider: "stripe",
          externalId: String(obj.id),
          status,
          periodEnd: subPeriodEnd(obj),
          userId: user.id,
          email: user.email,
        });
      }
    } else if (type === "customer.deleted") {
      await run(
        "UPDATE users SET stripe_customer_id = '' WHERE stripe_customer_id = ?",
        [String(obj.id)],
      );
    }
  } catch (e) {
    console.error("stripe webhook", type, e);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
