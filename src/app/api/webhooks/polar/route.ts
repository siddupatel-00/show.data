import { NextRequest, NextResponse } from "next/server";
import { ingest, mapPolar } from "@/lib/providers";
import { verifySvix } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Polar webhook endpoint. Point POLAR_WEBHOOK_SECRET at the signing secret
 * shown in Dashboard → Settings → Webhooks (Svix style headers).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
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

  const type = String(
    payload.type || payload.event_type || payload.body?.type || "",
  );
  try {
    const result =
      type.includes("subscription") || type === "checkout.paid"
        ? await ingest(mapPolar(payload))
        : { matched: 0, total: 0 };
    return NextResponse.json({ received: true, ...result });
  } catch (e) {
    console.error("polar webhook", type, e);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
