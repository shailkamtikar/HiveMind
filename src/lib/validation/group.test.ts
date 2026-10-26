import { describe, expect, it } from "vitest";
import { createGroupSchema, isUuid } from "./group";

describe("createGroupSchema", () => {
  it("trims and accepts a normal name", () => {
    expect(createGroupSchema.parse({ name: "  Trip planning  " }).name).toBe("Trip planning");
  });
  it("rejects empty and whitespace-only names", () => {
    expect(createGroupSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createGroupSchema.safeParse({ name: "    " }).success).toBe(false);
  });
  it("accepts exactly 80 characters and rejects 81", () => {
    expect(createGroupSchema.safeParse({ name: "x".repeat(80) }).success).toBe(true);
    expect(createGroupSchema.safeParse({ name: "x".repeat(81) }).success).toBe(false);
  });
  it("rejects a missing name", () => {
    expect(createGroupSchema.safeParse({}).success).toBe(false);
  });
});

describe("isUuid", () => {
  it("accepts a uuid and rejects other strings", () => {
    expect(isUuid("3f2b8c1e-5a4d-4e7f-9b2a-1c3d5e7f9a0b")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid("3f2b8c1e-5a4d-4e7f-9b2a-1c3d5e7f9a0b'; drop table groups;--")).toBe(false);
  });
});
