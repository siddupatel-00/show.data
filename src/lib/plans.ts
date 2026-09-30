import { get } from "./db";
import type { Plan } from "./auth";

export type PlanLimits = {
  sites: number;
  retentionDays: number;
  label: string;
  price: number;
};

export const PLANS: Record<Plan, PlanLimits> = {
  free: { sites: 3, retentionDays: 365, label: "Free", price: 0 },
  pro: { sites: 1000, retentionDays: 1825, label: "Pro", price: 12 },
};

export function limits(plan: Plan): PlanLimits {
  return PLANS[plan] ?? PLANS.free;
}

/** Data older than this is outside the plan's retention window. */
export function retentionFloor(plan: Plan, now = Date.now()): number {
  return now - limits(plan).retentionDays * 86400_000;
}

export async function siteCount(ownerId: string): Promise<number> {
  const row = await get<{ c: number }>(
    "SELECT COUNT(*) c FROM websites WHERE owner_id = ?",
    [ownerId],
  );
  return row?.c ?? 0;
}

export async function checkCanAddSite(
  ownerId: string,
  plan: Plan,
): Promise<{ ok: boolean; error?: string }> {
  const used = await siteCount(ownerId);
  const max = limits(plan).sites;
  if (used >= max) {
    return {
      ok: false,
      error: `The ${limits(plan).label} plan includes ${max} website${
        max === 1 ? "" : "s"
      }. Upgrade to Pro for unlimited sites.`,
    };
  }
  return { ok: true };
}
