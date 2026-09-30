import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { withTiming, startedAt } from "@/lib/timing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const t0 = startedAt();
  const user = await getCurrentUser();
  if (!user) return withTiming(NextResponse.json({ user: null }, { status: 401 }), t0);
  return withTiming(NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      stripe_customer_id: !!user.stripe_customer_id,
    },
  }), t0);
}
