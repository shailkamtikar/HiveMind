import { describe, expect, it } from "vitest";
import { safeNext } from "./safeNext";

describe("safeNext", () => {
  it("allows same-site relative paths", () => {
    expect(safeNext("/groups")).toBe("/groups");
    expect(safeNext("/groups/abc?x=1#y")).toBe("/groups/abc?x=1#y");
    expect(safeNext("/join/tok_en-1")).toBe("/join/tok_en-1");
  });
  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeNext("https://evil.com")).toBe("/groups");
    expect(safeNext("//evil.com")).toBe("/groups");
    expect(safeNext("/\\evil.com")).toBe("/groups");
    expect(safeNext("javascript:alert(1)")).toBe("/groups");
  });
  it("rejects backslashes and control characters", () => {
    expect(safeNext("/a\\b")).toBe("/groups");
    expect(safeNext("/a\nb")).toBe("/groups");
    expect(safeNext("/a\u0000b")).toBe("/groups");
  });
  it("falls back for empty, missing or non-string input", () => {
    expect(safeNext("")).toBe("/groups");
    expect(safeNext(null)).toBe("/groups");
    expect(safeNext(undefined)).toBe("/groups");
    expect(safeNext("groups")).toBe("/groups");
  });
  it("uses a custom fallback", () => {
    expect(safeNext("//x", "/home")).toBe("/home");
  });
});
