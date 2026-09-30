import { NextRequest, NextResponse } from "next/server";
import { isResponse, requireUser } from "@/lib/guard";
import { billingConfigured, startCheckout } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!billingConfigured())
    return NextResponse.json(
      { error: "Billing is not configured on this deployment" },
      { status: 503 },
    );
  const user = await requireUser();
  if (isResponse(user)) return user;

  const origin =
    process.env.APP_URL ||
    req.headers.get("origin") ||
    new URL(req.url).origin;
  try {
    const url = await startCheckout(user, origin);
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Checkout failed" },
      { status: 502 },
    );
  }
}
