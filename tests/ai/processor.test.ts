import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AiError } from "../../src/lib/ai/errors";
import type { AiTurn } from "../../src/lib/ai/prompt";
import { admin, cleanupTestUsers, createTestUser, type TestUser } from "../helpers/users";

// The processor imports server-only modules; the vitest alias turns the guard into a no-op.
const { processGroup } = await import("../../src/lib/ai/processor");

let a: TestUser;
let b: TestUser;

/** Mock model: records every call, answers "re: <last line>". */
function mockModel(opts: { delayMs?: number; fail?: (turns: AiTurn[]) => AiError | null } = {}) {
  const calls: AiTurn[][] = [];
  let running = 0;
  let maxRunning = 0;
  const generate = async (turns: AiTurn[]) => {
    calls.push(turns);
    running++;
    maxRunning = Math.max(maxRunning, running);
    try {
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      const err = opts.fail?.(turns);
      if (err) throw err;
      return `re: ${turns.at(-1)!.text}`;
    } finally {
      running--;
    }
  };
  return { generate, calls, maxRunning: () => maxRunning };
}

async function room(contents: string[], senders: TestUser[] = [a]) {
  const g = (await a.client.rpc("create_group", { p_name: "Processor" })).data as string;
  for (const s of senders) if (s.id !== a.id) await admin.from("group_members").insert({ group_id: g, user_id: s.id, role: "member" });
  const ids: string[] = [];
  for (const [i, content] of contents.entries()) {
    const sender = senders[i % senders.length];
    const { data } = await admin.from("messages").insert({ group_id: g, sender_id: sender.id, type: "user", content }).select("id").single();
    ids.push(data!.id);
  }
  return { g, ids };
}

const jobs = async (g: string) =>
  (await admin.from("ai_jobs").select("status, error_category, attempts, trigger_message_id").eq("group_id", g)).data!;
const replies = async (g: string) =>
  (await admin.from("messages").select("seq, content, job_id, sender_id").eq("group_id", g).eq("type", "assistant").order("seq")).data!;

beforeAll(async () => {
  a = await createTestUser("pa");
  b = await createTestUser("pb");
  await admin.from("profiles").update({ display_name: "Ann" }).eq("id", a.id);
  await admin.from("profiles").update({ display_name: "Bob" }).eq("id", b.id);
});
afterAll(async () => {
  await cleanupTestUsers();
});

describe("processing", () => {
  it("T4.4-1 one queued message gets one stored reply and a succeeded job", async () => {
    const { g } = await room(["hello"]);
    const m = mockModel();
    expect(await processGroup(g, { db: admin, generate: m.generate })).toEqual({ processed: 1, failed: 0, more: false });
    const r = await replies(g);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ content: "re: Ann: hello", sender_id: null });
    expect((await jobs(g))[0].status).toBe("succeeded");
  });

  it("T4.4-2 three queued messages are answered in order", async () => {
    const { g } = await room(["one", "two", "three"]);
    const m = mockModel();
    await processGroup(g, { db: admin, generate: m.generate });
    expect((await replies(g)).map((r) => r.content)).toEqual(["re: Ann: one", "re: Ann: two", "re: Ann: three"]);
    // Each reply saw only messages up to its own trigger (plus earlier replies).
    expect(m.calls.map((c) => c.at(-1)!.text)).toEqual(["Ann: one", "Ann: two", "Ann: three"]);
    expect(m.calls[0]).toHaveLength(1);
  });

  it("T4.4-3 two processors running at once never overlap and never double-reply", async () => {
    const { g } = await room(["x1", "x2", "x3", "x4"]);
    const m = mockModel({ delayMs: 150 });
    const results = await Promise.all([
      processGroup(g, { db: admin, generate: m.generate }),
      processGroup(g, { db: admin, generate: m.generate }),
      processGroup(g, { db: admin, generate: m.generate }),
    ]);
    expect(m.maxRunning()).toBe(1);
    expect(results.reduce((n, r) => n + r.processed, 0)).toBe(4);
    expect(await replies(g)).toHaveLength(4);
    expect((await jobs(g)).every((j) => j.status === "succeeded")).toBe(true);
  });

  it("T4.4-4 running again after everything is done does nothing", async () => {
    const { g } = await room(["done"]);
    const m = mockModel();
    await processGroup(g, { db: admin, generate: m.generate });
    expect(await processGroup(g, { db: admin, generate: m.generate })).toEqual({ processed: 0, failed: 0, more: false });
    expect(await replies(g)).toHaveLength(1);
    expect(m.calls).toHaveLength(1);
  });

  it("stress: 20 messages from two people arriving while three workers run: 20 jobs done, 20 replies, never two at once", async () => {
    const g = (await a.client.rpc("create_group", { p_name: "Stress" })).data as string;
    await admin.from("group_members").insert({ group_id: g, user_id: b.id, role: "member" });
    const m = mockModel({ delayMs: 40 });
    const workers = Array.from({ length: 12 }, async (_, i) => {
      await new Promise((r) => setTimeout(r, i * 150));
      return processGroup(g, { db: admin, generate: m.generate });
    });
    const senders = Array.from({ length: 20 }, async (_, i) => {
      await new Promise((r) => setTimeout(r, i * 60));
      const u = i % 2 ? b : a;
      await u.client.from("messages").insert({ group_id: g, sender_id: u.id, type: "user", content: `s${i + 1}` });
    });
    await Promise.all([...workers, ...senders]);
    await processGroup(g, { db: admin, generate: m.generate }); // sweep anything that arrived after the last worker
    const all = await jobs(g);
    expect(all).toHaveLength(20);
    expect(all.every((j) => j.status === "succeeded")).toBe(true);
    expect(await replies(g)).toHaveLength(20);
    expect(new Set((await replies(g)).map((r) => r.job_id)).size).toBe(20);
    expect(m.maxRunning()).toBe(1);
    expect(m.calls).toHaveLength(20);
  });

  it("T4.4-5 different groups progress in parallel", async () => {
    const g1 = await room(["g1"]);
    const g2 = await room(["g2"]);
    const m = mockModel({ delayMs: 900 });
    await Promise.all([processGroup(g1.g, { db: admin, generate: m.generate }), processGroup(g2.g, { db: admin, generate: m.generate })]);
    expect(m.maxRunning()).toBe(2);
    expect(await replies(g1.g)).toHaveLength(1);
    expect(await replies(g2.g)).toHaveLength(1);
  });

  it("T4.4-9 stops at the time budget and reports that more is waiting; a second pass finishes", async () => {
    const { g } = await room(["s1", "s2", "s3", "s4", "s5"]);
    const m = mockModel({ delayMs: 400 });
    const first = await processGroup(g, { db: admin, generate: m.generate, budgetMs: 900 });
    expect(first.more).toBe(true);
    expect(first.processed).toBeGreaterThanOrEqual(1);
    expect(first.processed).toBeLessThan(5);
    const second = await processGroup(g, { db: admin, generate: m.generate });
    expect(first.processed + second.processed).toBe(5);
    expect(second.more).toBe(false);
    expect((await replies(g)).map((r) => r.content)).toEqual(["s1", "s2", "s3", "s4", "s5"].map((s) => `re: Ann: ${s}`));
  });

  it("T4.4-11 the model sees exactly the last 20 messages up to the trigger, with speaker names", async () => {
    const texts = Array.from({ length: 25 }, (_, i) => `msg ${i + 1}`);
    const { g, ids } = await room(texts, [a, b]);
    // Only answer the 23rd message: pre-complete the others so the queue holds just that one job.
    for (const [i, id] of ids.entries()) {
      if (i !== 22) await admin.from("ai_jobs").update({ status: "succeeded" }).eq("trigger_message_id", id);
    }
    const m = mockModel();
    await processGroup(g, { db: admin, generate: m.generate });
    expect(m.calls).toHaveLength(1);
    const turns = m.calls[0];
    expect(turns).toHaveLength(20);
    expect(turns[0].text.endsWith("msg 4")).toBe(true);
    expect(turns[19].text.endsWith("msg 23")).toBe(true);
    expect(turns.some((t) => t.text.endsWith("msg 24"))).toBe(false);
    expect(turns[0].text.startsWith("Bob:") || turns[0].text.startsWith("Ann:")).toBe(true);
    expect(new Set(turns.map((t) => t.text.split(":")[0]))).toEqual(new Set(["Ann", "Bob"]));
  });

  it("includes earlier AI replies as model turns", async () => {
    const { g } = await room(["first"]);
    const m = mockModel();
    await processGroup(g, { db: admin, generate: m.generate });
    await admin.from("messages").insert({ group_id: g, sender_id: a.id, type: "user", content: "second" });
    await processGroup(g, { db: admin, generate: m.generate });
    expect(m.calls[1].map((t) => t.role)).toEqual(["user", "model", "user"]);
    expect(m.calls[1][1].text).toBe("re: Ann: first");
  });
});

describe("failures", () => {
  it("T5.1-1 a provider failure marks the job failed, keeps the message and stores no reply", async () => {
    const { g, ids } = await room(["will fail"]);
    const m = mockModel({ fail: () => new AiError("provider") });
    expect(await processGroup(g, { db: admin, generate: m.generate })).toEqual({ processed: 0, failed: 1, more: false });
    expect((await jobs(g))[0]).toMatchObject({ status: "failed", error_category: "provider" });
    expect(await replies(g)).toHaveLength(0);
    expect((await admin.from("messages").select("id").eq("id", ids[0])).data).toHaveLength(1);
  });

  it("an unexpected error is recorded as internal, and the failure does not block later messages", async () => {
    const { g } = await room(["boom", "fine"]);
    const m = mockModel({
      fail: (turns) => (turns.at(-1)!.text.includes("boom") ? (new Error("kaboom") as AiError) : null),
    });
    await processGroup(g, { db: admin, generate: m.generate });
    const statuses = (await jobs(g)).map((j) => `${j.status}/${j.error_category}`).sort();
    expect(statuses).toEqual(["failed/internal", "succeeded/null"]);
    expect((await replies(g)).map((r) => r.content)).toEqual(["re: Ann: fine"]);
  });

  it("logs categories only, never prompt or reply text", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { g } = await room(["my secret prompt text"]);
    await processGroup(g, { db: admin, generate: mockModel({ fail: () => new AiError("quota") }).generate });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("quota");
    expect(logged).not.toContain("secret");
    warn.mockRestore();
  });
});

describe("switches", () => {
  it("does nothing at all when AI_MODE=off, leaving jobs queued", async () => {
    vi.stubEnv("AI_MODE", "off");
    const { g } = await room(["quiet"]);
    const m = mockModel();
    expect(await processGroup(g, { db: admin, generate: m.generate })).toMatchObject({ processed: 0, skipped: "off" });
    expect(m.calls).toHaveLength(0);
    expect((await jobs(g))[0].status).toBe("queued");
    vi.unstubAllEnvs();
  });
});
