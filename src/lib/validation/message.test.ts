import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { historyQuerySchema, sendMessageSchema } from "./message";

const schema = sendMessageSchema(1000);

describe("sendMessageSchema", () => {
  it("trims content and keeps inner newlines", () => {
    expect(schema.parse({ content: "  hi\nthere  " }).content).toBe("hi\nthere");
  });
  it("rejects empty and whitespace-only content", () => {
    expect(schema.safeParse({ content: "" }).success).toBe(false);
    expect(schema.safeParse({ content: " \n\t " }).success).toBe(false);
  });
  it("accepts exactly the limit and rejects one more", () => {
    expect(schema.safeParse({ content: "x".repeat(1000) }).success).toBe(true);
    const over = schema.safeParse({ content: "x".repeat(1001) });
    expect(over.success).toBe(false);
    if (!over.success) expect(over.error.issues[0].message).toContain("1000");
  });
  it("counts the limit after trimming", () => {
    expect(schema.safeParse({ content: ` ${"x".repeat(1000)} ` }).success).toBe(true);
  });
  it("rejects NUL characters", () => {
    expect(schema.safeParse({ content: "a\u0000b" }).success).toBe(false);
  });
  it("accepts a uuid id and rejects other ids", () => {
    expect(schema.safeParse({ id: randomUUID(), content: "hi" }).success).toBe(true);
    expect(schema.safeParse({ id: "nope", content: "hi" }).success).toBe(false);
  });
  it("rejects missing or non-string content", () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ content: 5 }).success).toBe(false);
  });
});

describe("historyQuerySchema", () => {
  it("defaults to 30 messages", () => {
    expect(historyQuerySchema.parse({}).limit).toBe(30);
  });
  it("coerces numeric strings", () => {
    expect(historyQuerySchema.parse({ before: "12", limit: "5" })).toEqual({ before: 12, limit: 5 });
  });
  it("rejects bad numbers, oversized limits and before+after together", () => {
    expect(historyQuerySchema.safeParse({ before: "abc" }).success).toBe(false);
    expect(historyQuerySchema.safeParse({ before: "-1" }).success).toBe(false);
    expect(historyQuerySchema.safeParse({ limit: "201" }).success).toBe(false);
    expect(historyQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(historyQuerySchema.safeParse({ before: "5", after: "2" }).success).toBe(false);
  });
});
