import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { all, get, run } from "./db";
import { hashStored } from "./secrets";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: string,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Password hashing. scrypt with a memory-hard cost — 32 MiB per guess makes
 * offline cracking expensive even with a stolen database.
 */
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 } as const;

export const SESSION_COOKIE = "sidfast_session";
export const SESSION_DAYS = 30;

export type Plan = "free" | "pro";

export type User = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  plan: Plan;
  stripe_customer_id: string;
  created_at: number;
};

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64, SCRYPT);
  const { N, r, p } = SCRYPT;
  return `scrypt$${N}$${r}$${p}$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  let scheme: string;
  let salt: string;
  let hash: string;
  let N: number;
  let r: number;
  let p: number;

  if (parts.length === 6 && parts[0] === "scrypt") {
    // scrypt$N$r$p$salt$hash
    scheme = parts[0];
    N = Number(parts[1]);
    r = Number(parts[2]);
    p = Number(parts[3]);
    salt = parts[4];
    hash = parts[5];
  } else if (parts.length === 3 && parts[0] === "scrypt") {
    // legacy scrypt$salt$hash (Node defaults)
    scheme = parts[0];
    N = 16384;
    r = 8;
    p = 1;
    salt = parts[1];
    hash = parts[2];
  } else {
    return false;
  }

  if (!salt || !hash) return false;
  if (![N, r, p].every((v) => Number.isFinite(v) && v > 0)) return false;
  if (N > 1 << 22) return false; // refuse absurd costs from a tampered row

  const derived = await scrypt(password, salt, 64, {
    N,
    r,
    p,
    maxmem: 256 * 1024 * 1024,
  });
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}

/**
 * Session tokens are random 32 bytes; only their SHA-256 is stored, so a
 * leaked database cannot be replayed as live sessions.
 */
export async function createSession(userId: string): Promise<string> {
  const tok = randomBytes(32).toString("hex");
  const now = Date.now();
  await run(
    "INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    [hashStored(tok), userId, now + SESSION_DAYS * 86400_000, now],
  );
  return tok;
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  let secure = process.env.APP_URL?.startsWith("https://") ?? false;
  try {
    const h = await headers();
    const proto = h.get("x-forwarded-proto");
    const host = h.get("host") || "";
    secure =
      secure ||
      (proto ? proto === "https" : !host.startsWith("localhost"));
  } catch {
    secure = secure || false;
  }
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
    secure,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const tok = jar.get(SESSION_COOKIE)?.value;
  if (!tok) return null;
  const now = Date.now();
  const row = await get<User>(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`,
    [hashStored(tok), now],
  );
  return row ?? null;
}

export async function destroySession(token: string) {
  await run("DELETE FROM sessions WHERE token = ?", [hashStored(token)]);
}

export async function purgeExpiredSessions() {
  await run("DELETE FROM sessions WHERE expires_at < ?", [Date.now()]);
}

export function passwordHashOf(user: User): string {
  return user.password_hash;
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  return get<User>("SELECT * FROM users WHERE email = ?", [email]);
}

export async function countSitesOwned(userId: string): Promise<number> {
  const row = await get<{ c: number }>(
    "SELECT COUNT(*) c FROM websites WHERE owner_id = ?",
    [userId],
  );
  return row?.c ?? 0;
}
