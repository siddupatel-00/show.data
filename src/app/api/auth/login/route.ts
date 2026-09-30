import { NextRequest, NextResponse } from "next/server";
import { get } from "@/lib/db";
import { verifyPassword, createSession, setSessionCookie, User } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  const user = await get<User>("SELECT * FROM users WHERE email = ?", [email]);

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return NextResponse.json(
      { error: "Wrong email or password" },
      { status: 401 },
    );
  }

  const tok = await createSession(user.id);
  await setSessionCookie(tok);
  return NextResponse.json({ ok: true, id: user.id, email: user.email });
}
