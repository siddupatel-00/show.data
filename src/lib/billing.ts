import Stripe from "stripe";
import { get, run } from "./db";
import { findUserByEmail, type Plan, type User } from "./auth";
import { id as newId } from "./ids";

const ACTIVE = new Set(["active", "trialing", "authenticated", "paid", "on_hold"]);

export function hasStripe(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!stripeSingleton) stripeSingleton = new Stripe(key);
  return stripeSingleton;
}
let stripeSingleton: Stripe | null = null;

export function proPriceId(): string {
  return process.env.STRIPE_PRO_PRICE_ID || "";
}

export function billingConfigured(): boolean {
  return hasStripe() && !!proPriceId();
}

/** Best-effort link of a payment provider account back to a local user. */
export async function resolveUserId(args: {
  userId?: string;
  email?: string;
}): Promise<string | null> {
  if (args.userId) {
    const row = await get<{ id: string }>("SELECT id FROM users WHERE id = ?", [
      args.userId,
    ]);
    if (row) return row.id;
  }
  if (args.email) {
    const u = await findUserByEmail(args.email.toLowerCase().trim());
    if (u) return u.id;
  }
  return null;
}

export type SubscriptionInput = {
  provider: string;
  externalId: string;
  status: string;
  /** epoch milliseconds; 0 = no known end */
  periodEnd?: number;
  plan?: "pro";
  userId?: string;
  email?: string;
};

/**
 * Upsert a provider subscription and recompute the user's plan.
 * Returns the resolved user id, or null if we could not match an account.
 */
export async function applySubscription(
  input: SubscriptionInput,
): Promise<string | null> {
  const userId = await resolveUserId(input);
  if (!userId) return null;

  await run(
    `INSERT INTO subscriptions (id, user_id, provider, external_id, status, plan, current_period_end, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (provider, external_id) DO UPDATE SET
       user_id = excluded.user_id,
       status = excluded.status,
       plan = excluded.plan,
       current_period_end = excluded.current_period_end`,
    [
      newId("sub"),
      userId,
      input.provider,
      input.externalId,
      input.status,
      input.plan ?? "pro",
      input.periodEnd ?? 0,
      Date.now(),
    ],
  );
  await recomputePlan(userId);
  return userId;
}

export async function removeSubscription(
  provider: string,
  externalId: string,
  userId?: string,
): Promise<void> {
  await run("DELETE FROM subscriptions WHERE provider = ? AND external_id = ?", [
    provider,
    externalId,
  ]);
  if (userId) await recomputePlan(userId);
}

/** Derive users.plan from the live subscription rows. */
export async function recomputePlan(userId: string): Promise<Plan> {
  const now = Date.now();
  const rows = await allSubscriptions(userId);
  const pro = rows.some(
    (r) => ACTIVE.has(r.status.toLowerCase()) && (r.current_period_end === 0 || r.current_period_end > now),
  );
  const plan: Plan = pro ? "pro" : "free";
  await run("UPDATE users SET plan = ? WHERE id = ?", [plan, userId]);
  return plan;
}

async function allSubscriptions(userId: string) {
  const { all } = await import("./db");
  return all<{
    status: string;
    current_period_end: number;
    provider: string;
    external_id: string;
  }>("SELECT status, current_period_end, provider, external_id FROM subscriptions WHERE user_id = ?", [
    userId,
  ]);
}

/* ------------------------------------------------------------------ */
/* Stripe                                                              */
/* ------------------------------------------------------------------ */

export async function ensureStripeCustomer(user: User): Promise<string> {
  const s = stripeClient()!;
  if (user.stripe_customer_id) return user.stripe_customer_id;
  const customer = await s.customers.create({
    email: user.email,
    name: user.name || undefined,
    metadata: { userId: user.id },
  });
  await run("UPDATE users SET stripe_customer_id = ? WHERE id = ?", [
    customer.id,
    user.id,
  ]);
  return customer.id;
}

export async function startCheckout(
  user: User,
  origin: string,
): Promise<string> {
  const s = stripeClient()!;
  const customer = await ensureStripeCustomer(user);
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price: proPriceId(), quantity: 1 }],
    client_reference_id: user.id,
    success_url: `${origin}/dashboard?billing=success`,
    cancel_url: `${origin}/?billing=cancelled`,
    subscription_data: { metadata: { userId: user.id } },
    allow_promotion_codes: true,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

export async function startPortal(user: User, origin: string): Promise<string> {
  const s = stripeClient()!;
  const customer = await ensureStripeCustomer(user);
  const session = await s.billingPortal.sessions.create({
    customer,
    return_url: `${origin}/dashboard`,
  });
  return session.url;
}

/* ------------------------------------------------------------------ */
/* Checkout -> webhook wiring for the hosted-checkout providers        */
/* ------------------------------------------------------------------ */

type Meta = Record<string, string>;

/** Pull our own ids out of whatever metadata field a provider echoes back. */
export function readMeta(source: unknown): Meta {
  const out: Meta = {};
  if (!source || typeof source !== "object") return out;
  for (const [k, v] of Object.entries(source as Record<string, unknown>)) {
    if (typeof v === "string" || typeof v === "number") out[k] = String(v);
  }
  return out;
}

export function epochMs(value: unknown): number {
  if (typeof value === "number") return value > 1e12 ? value : value * 1000;
  if (typeof value === "string" && value) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n > 1e12 ? n : n * 1000;
    const t = Date.parse(value);
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

/** Stripe moved current_period_end onto the subscription item; accept both. */
export function subPeriodEnd(sub: Record<string, any>): number {
  const raw =
    sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? 0;
  return Number(raw) * 1000;
}
