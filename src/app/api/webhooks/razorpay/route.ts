import { NextRequest, NextResponse } from "next/server";
import { ingest, mapRazorpay } from "@/lib/providers";
import { verifyRazorpay } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Razorpay webhook endpoint. Set RAZORPAY_WEBHOOK_SECRET to the secret you
 * chose when registering the webhook; signature arrives in
 * x-razorpay-signature (hex HMAC-SHA256 of the raw body).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret)
    return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature");
  if (!verifyRazorpay(raw, sig, secret))
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  const name = String(payload.event || "");
  try {
    const result = name.startsWith("subscription.")
      ? await ingest(mapRazorpay(payload))
      : { matched: 0, total: 0 };
    return NextResponse.json({ received: true, ...result });
  } catch (e) {
    console.error("razorpay webhook", name, e);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
