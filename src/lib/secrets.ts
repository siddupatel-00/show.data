import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";

/**
 * Everything that has to stay secret lives behind this module:
 *  - appSecret()      stable key material for signing and encryption
 *  - hashToken()      one-way hash for values we only need to look up
 *  - encryptToken()   AES-256-GCM for values we must read back (OAuth tokens)
 */

const DEV_SECRET = "sidfast-insecure-dev-secret";

let cachedSecret: string | null = null;

/**
 * Preference order: explicit APP_SECRET, then any provider secret we already
 * hold. In production a missing secret is a real weakness, so we shout.
 */
export function appSecret(): string {
  if (cachedSecret) return cachedSecret;
  const explicit = process.env.APP_SECRET?.trim();
  if (explicit) {
    cachedSecret = explicit;
    return explicit;
  }
  const fallback = [
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.TURSO_AUTH_TOKEN,
  ].find((v) => v && v.length >= 16);
  if (fallback) {
    cachedSecret = createHash("sha256")
      .update(`sidfast:${fallback}`)
      .digest("hex");
    return cachedSecret;
  }
  if (process.env.NODE_ENV === "production")
    console.warn(
      "[security] APP_SECRET is not set — falling back to a built-in secret. Set APP_SECRET in your environment.",
    );
  cachedSecret = DEV_SECRET;
  return DEV_SECRET;
}

/** 32 bytes of key material derived from appSecret(). */
function deriveKey(): Buffer {
  return scryptSync(appSecret(), "sidfast-token-encryption", 32, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
}

/** One-way hash — use for tokens we only ever look up by exact value. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Deterministic prefixed form so hashed rows are easy to recognise. */
export function hashStored(token: string): string {
  return `sha256:${hashToken(token)}`;
}

export function isHashed(value: string): boolean {
  return value.startsWith("sha256:");
}

/** AES-256-GCM. Output: base64(iv).base64(tag).base64(ciphertext) */
export function encryptToken(plain: string): string {
  if (!plain) return "";
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    enc.toString("base64"),
  ].join(".");
}

export function decryptToken(stored: string): string {
  if (!stored) return "";
  // Not in our format (row written before encryption) — return as-is.
  if (!/^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/.test(stored))
    return stored;
  try {
    const [ivB64, tagB64, dataB64] = stored.split(".");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveKey(),
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Key changed or the row is corrupted — surface nothing usable.
    return "";
  }
}
