import { describe, expect, it } from "vitest";
import { getConfig } from "./config";

describe("getConfig", () => {
  it("uses defaults", () => {
    expect(getConfig({})).toEqual({
      maxGroupMembers: 5,
      maxMessageLength: 1000,
      aiContextMessages: 20,
      inviteExpiryDays: 3,
    });
  });
  it("accepts overrides", () => {
    expect(getConfig({ MAX_GROUP_MEMBERS: "8" }).maxGroupMembers).toBe(8);
  });
  it("rejects non-numeric values and names the variable", () => {
    expect(() => getConfig({ MAX_MESSAGE_LENGTH: "abc" })).toThrow(/MAX_MESSAGE_LENGTH/);
  });
  it("rejects out-of-range values", () => {
    expect(() => getConfig({ MAX_MESSAGE_LENGTH: "0" })).toThrow();
    expect(() => getConfig({ MAX_MESSAGE_LENGTH: "99999" })).toThrow();
    expect(() => getConfig({ INVITE_EXPIRY_DAYS: "31" })).toThrow();
  });
});
