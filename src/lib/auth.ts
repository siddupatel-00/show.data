import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { all, get, run } from "./db";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

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
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const derived = await scrypt(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}

export async function createSession(userId: string): Promise<string> {
  const tok = randomBytes(32).toString("hex");
  const now = Date.now();
  await run(
    "INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    [tok, userId, now + SESSION_DAYS * 86400_000, now],
  );
  return tok;
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  let secure = true;
  try {
    const h = await headers();
    const proto = h.get("x-forwarded-proto");
    const host = h.get("host") || "";
    secure = proto ? proto === "https" : !host.startsWith("localhost");
  } catch {
    secure = false;
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
    [tok, now],
  );
  return row ?? null;
}

export async function destroySession(token: string) {
  await run("DELETE FROM sessions WHERE token = ?", [token]);
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
