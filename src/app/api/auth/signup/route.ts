import { NextRequest, NextResponse } from "next/server";
import { get } from "@/lib/db";
import { hashPassword, createSession, setSessionCookie } from "@/lib/auth";
import { run } from "@/lib/db";
import { id } from "@/lib/ids";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const name = String(body.name || "").trim().slice(0, 80);

  if (!EMAIL_RE.test(email))
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  if (password.length < 8)
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 },
    );

  const existing = await get("SELECT id FROM users WHERE email = ?", [email]);
  if (existing)
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 },
    );

  const userId = id("u_");
  await run(
    "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
    [userId, email, name, await hashPassword(password), Date.now()],
  );

  const tok = await createSession(userId);
  await setSessionCookie(tok);

  const { sendWelcome } = await import("@/lib/email");
  sendWelcome(email, name).catch(() => {});

  return NextResponse.json({ ok: true, id: userId, email });
}
