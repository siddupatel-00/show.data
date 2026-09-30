import { NextRequest, NextResponse } from "next/server";
import { destroySession, clearSessionCookie, SESSION_COOKIE } from "@/lib/auth";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function POST(_req: NextRequest) {
  const jar = await cookies();
  const tok = jar.get(SESSION_COOKIE)?.value;
  if (tok) await destroySession(tok);
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
