import { describe, expect, it } from "vitest";
import { generateInviteToken, hashInviteToken, isPlausibleToken, TOKEN_LENGTH } from "./token";

describe("invite tokens", () => {
  it("T3.1-8 generates unique, URL-safe tokens of at least 43 characters", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const { token } = generateInviteToken();
      expect(token).toHaveLength(TOKEN_LENGTH);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      seen.add(token);
    }
    expect(seen.size).toBe(1000);
  });

  it("stores a 64-character hex hash that differs from the token and is deterministic", () => {
    const { token, hash } = generateInviteToken();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashInviteToken(token)).toBe(hash);
    expect(hashInviteToken(token + "x")).not.toBe(hash);
  });

  it("recognises only well-formed tokens", () => {
    expect(isPlausibleToken(generateInviteToken().token)).toBe(true);
    for (const bad of ["", "abc", "a".repeat(42), "a".repeat(44), "a".repeat(42) + "!", null, undefined, 5, {}]) {
      expect(isPlausibleToken(bad)).toBe(false);
    }
  });
});
