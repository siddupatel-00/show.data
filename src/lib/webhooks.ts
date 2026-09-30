import { createHmac, timingSafeEqual } from "node:crypto";

export function hmacSha256Hex(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function hmacSha256Base64(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("base64");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

/** Stripe: `stripe-signature: t=<ts>,v1=<hex>` over `${t}.${body}`. */
export function verifyStripe(
  raw: string,
  header: string | null,
  secret: string,
): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => kv.split("=") as [string, string]),
  );
  if (!parts.t || !parts.v1) return false;
  return safeEqual(
    hmacSha256Hex(secret, `${parts.t}.${raw}`),
    parts.v1,
  );
}

/**
 * Svix-style (Polar, Dodo): `webhook-signature: v1,<base64>` over
 * `${webhook-id}.${webhook-timestamp}.${raw}`.
 */
export function verifySvix(
  raw: string,
  headers: Headers,
  secret: string,
): boolean {
  if (!secret) return false;
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sig = headers.get("webhook-signature");
  if (!sig) return false;
  const expected = hmacSha256Base64(
    secret,
    `${id ?? ""}.${ts ?? ""}.${raw}`,
  );
  return sig.split(" ").some((entry) => {
    const [, value] = entry.split(",");
    return value ? safeEqual(value.trim(), expected) : false;
  });
}

/** Lemon Squeezy: `x-signature` = hex HMAC of the raw body. */
export function verifyHexSignature(
  raw: string,
  header: string | null,
  secret: string,
): boolean {
  if (!header || !secret) return false;
  return safeEqual(hmacSha256Hex(secret, raw), header.trim());
}

/** Razorpay: `x-razorpay-signature` = hex HMAC-SHA256 of raw body. */
export const verifyRazorpay = verifyHexSignature;
