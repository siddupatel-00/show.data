import { randomBytes, randomUUID } from "node:crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function id(prefix = ""): string {
  const raw = randomBytes(16).toString("hex");
  return prefix + raw;
}

export function shortId(len = 12): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function token(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function uuid(): string {
  return randomUUID();
}
