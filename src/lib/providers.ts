import { applySubscription, epochMs, type SubscriptionInput } from "./billing";

/** Collapse the provider-specific vocabulary onto a handful of states. */
export function normalizeStatus(raw: unknown): string {
  const s = String(raw || "").toLowerCase().trim();
  if (!s) return "canceled";
  if (["cancelled", "expired", "deleted", "unpaid", "closed"].includes(s))
    return "canceled";
  if (["on_trial", "trialing", "trial"].includes(s)) return "trialing";
  if (["past_due", "past_due_grace", "dunning", "incomplete"].includes(s))
    return "past_due";
  if (["paused", "on_hold", "halted"].includes(s)) return "on_hold";
  if (["authenticated", "created", "on_trial_active"].includes(s))
    return "authenticated";
  if (["paid", "renewed", "succeeded", "payment_success"].includes(s))
    return "active";
  return s;
}

function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

type Any = Record<string, any>;

/* ---------------------------- Polar ---------------------------- */

export function mapPolar(payload: Any): SubscriptionInput[] {
  const data = (payload.data ?? payload) as Any;
  const subId = str(data.subscription_id || data.id);
  if (!subId) return [];
  const customer = data.customer ?? {};
  return [
    {
      provider: "polar",
      externalId: subId,
      status: normalizeStatus(data.status),
      periodEnd: epochMs(data.current_period_end || data.current_period_end_date),
      email:
        str(customer.email) ||
        str(data.customer_email) ||
        str(data.checkout?.customer_email),
      userId:
        str(data.metadata?.userId) ||
        str(data.checkout?.metadata?.userId) ||
        str(payload.metadata?.userId),
    },
  ];
}

/* ----------------------- Lemon Squeezy ------------------------- */

export function mapLemonSqueezy(payload: Any): SubscriptionInput[] {
  const attrs = payload.data?.attributes ?? {};
  const custom = payload.meta?.custom_data ?? {};
  const id = str(payload.data?.id);
  if (!id) return [];
  return [
    {
      provider: "lemonsqueezy",
      externalId: id,
      status: normalizeStatus(attrs.status),
      periodEnd: epochMs(attrs.renews_at || attrs.ends_at || attrs.renews),
      email: str(attrs.user_email) || str(attrs.customer_email),
      userId: str(custom.user_id) || str(attrs.metadata?.userId),
    },
  ];
}

/* -------------------------- Razorpay --------------------------- */

export function mapRazorpay(payload: Any): SubscriptionInput[] {
  const sub = payload.payload?.subscription?.entity;
  if (!sub) return [];
  const payment = payload.payload?.payment?.entity ?? {};
  const notes = sub.notes ?? {};
  let status = normalizeStatus(sub.status);
  // A subscription only exists once it has been authenticated and started.
  if (status === "created") status = "pending";
  return [
    {
      provider: "razorpay",
      externalId: str(sub.id),
      status,
      periodEnd: epochMs(sub.current_end),
      email: str(payment.email) || str(notes.email),
      userId: str(notes.user_id) || str(notes.userId),
    },
  ];
}

/* ---------------------------- Dodo ----------------------------- */

export function mapDodo(payload: Any): SubscriptionInput[] {
  const data = payload.data ?? {};
  const subId = str(data.subscription_id);
  if (!subId) return [];
  const customer = data.customer ?? {};
  return [
    {
      provider: "dodo",
      externalId: subId,
      status: normalizeStatus(data.status),
      periodEnd: epochMs(
        data.current_period_end || data.next_billing_date || data.renews_at,
      ),
      email: str(customer.email) || str(data.customer_email),
      userId: str(data.metadata?.userId) || str(payload.metadata?.userId),
    },
  ];
}

/** Run mapped inputs through the shared subscription upsert. */
export async function ingest(
  inputs: SubscriptionInput[],
): Promise<{ matched: number; total: number }> {
  let matched = 0;
  for (const input of inputs) {
    const userId = await applySubscription(input);
    if (userId) matched++;
    else
      console.warn(
        `subscription webhook: no user matched for ${input.provider}/${input.externalId} (email=${input.email || "none"})`,
      );
  }
  return { matched, total: inputs.length };
}
