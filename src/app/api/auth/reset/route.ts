import { NextRequest, NextResponse } from "next/server";
import {
  createSession,
  hashPassword,
  setSessionCookie,
} from "@/lib/auth";
import { get, run } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const tok = String(body?.token || "");
  const password = String(body?.password || "");
  if (!tok)
    return NextResponse.json({ error: "Missing reset link" }, { status: 400 });
  if (password.length < 8)
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 },
    );

  const row = await get<{ user_id: string }>(
    "SELECT user_id FROM password_resets WHERE token = ? AND expires_at > ?",
    [tok, Date.now()],
  );
  if (!row)
    return NextResponse.json(
      { error: "This reset link is invalid or has expired" },
      { status: 400 },
    );

  await run("UPDATE users SET password_hash = ? WHERE id = ?", [
    await hashPassword(password),
    row.user_id,
  ]);
  await run("DELETE FROM password_resets WHERE user_id = ?", [row.user_id]);
  await run("DELETE FROM sessions WHERE user_id = ?", [row.user_id]);

  const session = await createSession(row.user_id);
  await setSessionCookie(session);
  return NextResponse.json({ ok: true });
}
