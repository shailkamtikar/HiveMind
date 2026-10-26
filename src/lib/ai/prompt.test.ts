import { describe, expect, it } from "vitest";
import { buildTurns, SYSTEM_PROMPT, type PromptMessage } from "./prompt";

const names = new Map([
  ["a", "Ann"],
  ["b", "Bob"],
]);
const msg = (seq: number, type: PromptMessage["type"], sender: string | null, content = `m${seq}`): PromptMessage => ({
  seq,
  type,
  sender_id: sender,
  content,
});

describe("buildTurns", () => {
  const fifty = Array.from({ length: 50 }, (_, i) => msg(i + 1, "user", i % 2 ? "a" : "b"));

  it("T4.3-1 uses exactly the last 20 messages, in order", () => {
    const turns = buildTurns(fifty, names, { triggerSeq: 50, limit: 20 });
    expect(turns).toHaveLength(20);
    expect(turns[0].text.endsWith("m31")).toBe(true);
    expect(turns[19].text.endsWith("m50")).toBe(true);
  });

  it("T4.3-2 prefixes each member line with the display name", () => {
    const turns = buildTurns([msg(1, "user", "a", "hi"), msg(2, "user", "b", "yo")], names, { triggerSeq: 2, limit: 20 });
    expect(turns.map((t) => t.text)).toEqual(["Ann: hi", "Bob: yo"]);
  });

  it("T4.3-3 excludes everything after the trigger message", () => {
    const turns = buildTurns(fifty, names, { triggerSeq: 30, limit: 20 });
    expect(turns).toHaveLength(20);
    expect(turns.at(-1)!.text.endsWith("m30")).toBe(true);
    expect(turns.some((t) => t.text.endsWith("m31"))).toBe(false);
  });

  it("is order-independent for its input and ignores system notices", () => {
    const turns = buildTurns([msg(3, "user", "a", "c"), msg(1, "user", "a", "a"), msg(2, "system", null, "notice")], names, {
      triggerSeq: 3,
      limit: 20,
    });
    expect(turns.map((t) => t.text)).toEqual(["Ann: a", "Ann: c"]);
  });

  it("maps assistant messages to the model role and never starts with one", () => {
    const turns = buildTurns(
      [msg(1, "assistant", null, "old reply"), msg(2, "user", "a", "q"), msg(3, "assistant", null, "a1"), msg(4, "user", "b", "q2")],
      names,
      { triggerSeq: 4, limit: 3 },
    );
    expect(turns.map((t) => t.role)).toEqual(["user", "model", "user"]);
    const cut = buildTurns([msg(1, "user", "a", "q"), msg(2, "assistant", null, "a1"), msg(3, "user", "b", "q2")], names, {
      triggerSeq: 3,
      limit: 2,
    });
    expect(cut.map((t) => t.role)).toEqual(["user"]);
  });

  it("falls back to 'Member' for unknown senders", () => {
    expect(buildTurns([msg(1, "user", null, "hi")], names, { triggerSeq: 1, limit: 5 })[0].text).toBe("Member: hi");
    expect(buildTurns([msg(1, "user", "zzz", "hi")], names, { triggerSeq: 1, limit: 5 })[0].text).toBe("Member: hi");
  });
});

describe("SYSTEM_PROMPT", () => {
  it("tells the model chat text is data and secrets stay secret", () => {
    expect(SYSTEM_PROMPT).toMatch(/not instructions/i);
    expect(SYSTEM_PROMPT).toMatch(/never reveal/i);
  });
});
