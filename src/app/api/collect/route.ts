import { NextRequest, NextResponse } from "next/server";
import { getSiteByToken } from "@/lib/sites";
import { recordGoal, recordPageview, recordPayment } from "@/lib/collect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

function respond(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS });
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const payload: Record<string, string> = {};
  q.forEach((v, k) => {
    payload[k] = v;
  });
  return handle(payload, req.headers);
}

export async function POST(req: NextRequest) {
  let payload: Record<string, unknown> = {};
  try {
    const type = req.headers.get("content-type") || "";
    if (type.includes("text/plain")) {
      payload = JSON.parse(await req.text());
    } else {
      payload = await req.json();
    }
  } catch {
    return respond({ ok: false, error: "bad body" }, 400);
  }
  return handle(payload, req.headers);
}

async function handle(payload: Record<string, unknown>, headers: Headers) {
  const siteKey = String(payload.site || "");
  if (!siteKey) return respond({ ok: false, error: "missing site" }, 400);
  const site = await getSiteByToken(siteKey);
  if (!site) return respond({ ok: false, error: "unknown site" }, 404);

  const type = String(payload.type || "pageview");
  try {
    if (type === "payment") {
      const res = await recordPayment(site, payload as any, headers);
      return respond(res, res.ok ? 200 : 400);
    }
    if (type === "goal") {
      const res = await recordGoal(site, payload as any, headers);
      return respond(res, res.ok ? 200 : 400);
    }
    const res = await recordPageview(site, payload as any, headers);
    return respond(res);
  } catch (err) {
    console.error("collect error", err);
    return respond({ ok: false }, 500);
  }
}
