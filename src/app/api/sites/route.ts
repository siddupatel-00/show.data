import { NextRequest, NextResponse } from "next/server";
import { requireUser, isResponse } from "@/lib/guard";
import { createSite, listSitesForUser, normalizeDomain } from "@/lib/sites";
import { checkCanAddSite } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  return NextResponse.json({ sites: await listSitesForUser(user.id) });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim().slice(0, 80);
  const domain = normalizeDomain(String(body.domain || ""));
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!domain)
    return NextResponse.json({ error: "Domain is required" }, { status: 400 });

  const allowed = await checkCanAddSite(user.id, user.plan);
  if (!allowed.ok)
    return NextResponse.json({ error: allowed.error }, { status: 402 });

  const site = await createSite(user.id, name, domain);
  return NextResponse.json({ site });
}
