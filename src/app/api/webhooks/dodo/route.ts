import { NextRequest, NextResponse } from "next/server";
import { ingest, mapDodo } from "@/lib/providers";
import { verifySvix } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dodo Payments webhook endpoint. Set DODO_WEBHOOK_SECRET to the signing
 * secret from Dodo → Developer → Webhooks (Svix style headers).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.DODO_WEBHOOK_SECRET;
  if (!secret)
    return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const raw = await req.text();
  if (!verifySvix(raw, req.headers, secret))
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  const type = String(payload.type || "");
  try {
    const result =
      type.startsWith("subscription") || payload.data?.payload_type === "Subscription"
        ? await ingest(mapDodo(payload))
        : { matched: 0, total: 0 };
    return NextResponse.json({ received: true, ...result });
  } catch (e) {
    console.error("dodo webhook", type, e);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
