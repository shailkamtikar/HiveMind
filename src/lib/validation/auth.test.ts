import { describe, expect, it } from "vitest";
import { fieldErrors, signInSchema, signUpSchema } from "./auth";

describe("signUpSchema", () => {
  it("trims the name, normalises the email and accepts a good password", () => {
    const r = signUpSchema.parse({ name: "  Ann  ", email: "  Ann@Example.COM ", password: "longenough1" });
    expect(r).toEqual({ name: "Ann", email: "ann@example.com", password: "longenough1" });
  });

  it("reports one message per field", () => {
    const r = signUpSchema.safeParse({ name: " ", email: "nope", password: "short" });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(fieldErrors(r.error)).sort()).toEqual(["email", "name", "password"]);
  });

  it("enforces password length bounds (8 to 72)", () => {
    const base = { name: "A", email: "a@b.co" };
    expect(signUpSchema.safeParse({ ...base, password: "x".repeat(7) }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...base, password: "x".repeat(8) }).success).toBe(true);
    expect(signUpSchema.safeParse({ ...base, password: "x".repeat(72) }).success).toBe(true);
    expect(signUpSchema.safeParse({ ...base, password: "x".repeat(73) }).success).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(signUpSchema.safeParse({ name: 1, email: 2, password: 3 }).success).toBe(false);
  });
});

describe("signInSchema", () => {
  it("requires a valid email and a password, without judging password strength", () => {
    expect(signInSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
    expect(signInSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
    expect(signInSchema.safeParse({ email: "abc", password: "x" }).success).toBe(false);
  });
});
