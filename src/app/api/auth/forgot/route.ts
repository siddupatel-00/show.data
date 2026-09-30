import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { token as randomToken } from "@/lib/ids";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_MINUTES = 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email))
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });

  const user = await findUserByEmail(email);
  if (user) {
    const tok = randomToken(32);
    const now = Date.now();
    await run("DELETE FROM password_resets WHERE user_id = ?", [user.id]);
    await run(
      "INSERT INTO password_resets (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
      [tok, user.id, now + RESET_MINUTES * 60_000, now],
    );
    const base =
      process.env.APP_URL ||
      req.headers.get("origin") ||
      new URL(req.url).origin;
    const url = `${base}/reset?token=${tok}`;
    const { sendPasswordReset, emailConfigured } = await import(
      "@/lib/email"
    );
    const sent = await sendPasswordReset(user.email, url);
    if (!sent)
      console.warn(
        `[password reset] email not sent${
          emailConfigured() ? "" : " (RESEND_API_KEY unset)"
        } → ${url}`,
      );
  }

  // Never reveal whether the address exists.
  return NextResponse.json({ ok: true });
}
