import { NextRequest, NextResponse } from "next/server";
import { get } from "@/lib/db";
import {
  createSession,
  hashPassword,
  setSessionCookie,
  verifyPassword,
  User,
} from "@/lib/auth";
import { enforce } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * A real scrypt hash of a random string. When the account does not exist we
 * still run a verification against it, so unknown addresses take the same
 * time as known ones and cannot be enumerated by response latency.
 */
let dummyHash: Promise<string> | null = null;
function burnTime(): Promise<string> {
  if (!dummyHash)
    dummyHash = hashPassword(Math.random().toString(36).slice(2));
  return dummyHash;
}

export async function POST(req: NextRequest) {
  const blocked = await enforce(req, "login:ip", 30, 5 * 60_000);
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);
  if (!body)
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  const perEmail = await enforce(req, "login:email", 10, 15 * 60_000, email);
  if (perEmail) return perEmail;

  const user = await get<User>("SELECT * FROM users WHERE email = ?", [email]);

  let ok = false;
  if (user) {
    ok = await verifyPassword(password, user.password_hash);
  } else {
    await verifyPassword(password, await burnTime());
  }

  if (!user || !ok) {
    return NextResponse.json(
      { error: "Wrong email or password" },
      { status: 401 },
    );
  }

  const tok = await createSession(user.id);
  await setSessionCookie(tok);
  return NextResponse.json({ ok: true, id: user.id, email: user.email });
}
