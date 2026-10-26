import { describe, expect, it } from "vitest";
import { lastSeq, mergeMessages, toChatMessage } from "./messages";
import type { ChatMessage, ServerMessage } from "./types";

const server = (seq: number, over: Partial<ServerMessage> = {}): ServerMessage => ({
  id: `m${seq}`,
  seq,
  group_id: "g",
  sender_id: "u1",
  type: "user",
  content: `message ${seq}`,
  created_at: new Date(2026, 0, 1, 0, 0, seq).toISOString(),
  sender_name: "Ada",
  ...over,
});

const pending = (id: string, secondsAfter = 0): ChatMessage => ({
  id,
  seq: null,
  group_id: "g",
  sender_id: "u1",
  type: "user",
  content: id,
  created_at: new Date(2026, 0, 2, 0, 0, secondsAfter).toISOString(),
  sender_name: "Ada",
  status: "sending",
});

describe("mergeMessages", () => {
  it("T2.3-6 a duplicate event produces one item", () => {
    const once = mergeMessages([], [server(1)]);
    const twice = mergeMessages(once, [server(1)]);
    expect(twice).toHaveLength(1);
  });

  it("T2.3-7 out-of-order delivery ends up sorted by seq", () => {
    const merged = mergeMessages(mergeMessages([], [server(5)]), [server(4)]);
    expect(merged.map((m) => m.seq)).toEqual([4, 5]);
  });

  it("sorts a mixed batch by seq", () => {
    const merged = mergeMessages([], [server(3), server(1), server(2)]);
    expect(merged.map((m) => m.seq)).toEqual([1, 2, 3]);
  });

  it("a server copy replaces the pending local copy with the same id", () => {
    const merged = mergeMessages([pending("abc")], [server(7, { id: "abc", content: "abc" })]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: "abc", seq: 7, status: "sent" });
  });

  it("pending messages stay after confirmed ones, in creation order", () => {
    const merged = mergeMessages([pending("p2", 2), pending("p1", 1)], [server(9)]);
    expect(merged.map((m) => m.id)).toEqual(["m9", "p1", "p2"]);
  });

  it("failed messages are kept when unrelated messages arrive", () => {
    const failed: ChatMessage = { ...pending("f"), status: "failed", errorText: "boom" };
    const merged = mergeMessages([failed], [server(1)]);
    expect(merged.find((m) => m.id === "f")).toMatchObject({ status: "failed", errorText: "boom" });
  });

  it("keeps a known sender name when the incoming copy has none", () => {
    const first = mergeMessages([], [server(1)]);
    const again = mergeMessages(first, [server(1, { sender_name: null })]);
    expect(again[0].sender_name).toBe("Ada");
  });

  it("does not mutate its inputs", () => {
    const current = [toChatMessage(server(1))];
    const snapshot = JSON.stringify(current);
    mergeMessages(current, [server(2)]);
    expect(JSON.stringify(current)).toBe(snapshot);
  });
});

describe("lastSeq", () => {
  it("returns the highest confirmed seq and ignores pending messages", () => {
    expect(lastSeq([toChatMessage(server(3)), toChatMessage(server(8)), pending("p")])).toBe(8);
    expect(lastSeq([])).toBe(0);
    expect(lastSeq([pending("p")])).toBe(0);
  });
});
