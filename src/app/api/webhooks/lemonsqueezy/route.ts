import { NextRequest, NextResponse } from "next/server";
import { ingest, mapLemonSqueezy } from "@/lib/providers";
import { verifyHexSignature } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lemon Squeezy webhook endpoint. Set LEMONSQUEEZY_WEBHOOK_SECRET to the
 * signing secret; the signature arrives in x-signature (hex HMAC of body).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret)
    return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const raw = await req.text();
  const sig =
    req.headers.get("x-signature") || req.headers.get("x-lemonsqueezy-signature");
  if (!verifyHexSignature(raw, sig, secret))
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  const name = String(
    req.headers.get("x-event-name") || payload.meta?.event_name || "",
  ).toLowerCase();
  try {
    const result = name.startsWith("subscription")
      ? await ingest(mapLemonSqueezy(payload))
      : { matched: 0, total: 0 };
    return NextResponse.json({ received: true, ...result });
  } catch (e) {
    console.error("lemonsqueezy webhook", name, e);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
