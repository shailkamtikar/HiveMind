import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes as base64url is always 43 characters. */
export const TOKEN_LENGTH = 43;

/** A fresh invitation token and the hash that is stored in its place. */
export function generateInviteToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInviteToken(token) };
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Cheap shape check so obviously malformed values never reach the database. */
export function isPlausibleToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}
