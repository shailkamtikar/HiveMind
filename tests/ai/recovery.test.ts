import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AiError } from "../../src/lib/ai/errors";
import type { AiTurn } from "../../src/lib/ai/prompt";
import { admin, cleanupTestUsers, createTestUser, type TestUser } from "../helpers/users";

const { processGroup } = await import("../../src/lib/ai/processor");

let a: TestUser;

const model = (fail?: AiErrorLike) => {
  const calls: string[] = [];
  return {
    calls,
    generate: async (turns: AiTurn[]) => {
      calls.push(turns.at(-1)!.text);
      if (fail) throw fail;
      return `re: ${turns.at(-1)!.text}`;
    },
  };
};
type AiErrorLike = AiError;

async function room(contents: string[]) {
  const g = (await a.client.rpc("create_group", { p_name: "Recovery" })).data as string;
  const ids: string[] = [];
  for (const content of contents) {
    const { data } = await admin.from("messages").insert({ group_id: g, sender_id: a.id, type: "user", content }).select("id").single();
    ids.push(data!.id);
  }
  return { g, ids };
}
const jobOf = async (messageId: string) =>
  (await admin.from("ai_jobs").select("id, status, attempts, error_category").eq("trigger_message_id", messageId).single()).data!;
const replies = async (g: string) =>
  (await admin.from("messages").select("content").eq("group_id", g).eq("type", "assistant").order("seq")).data!.map((m) => m.content);
const crash = (messageId: string, secondsAgo: number, attempts = 1) =>
  admin
    .from("ai_jobs")
    .update({ status: "processing", attempts, locked_at: new Date(Date.now() - secondsAgo * 1000).toISOString() })
    .eq("trigger_message_id", messageId);

beforeAll(async () => {
  a = await createTestUser("rec");
  await admin.from("profiles").update({ display_name: "Ann" }).eq("id", a.id);
});
afterAll(async () => {
  await cleanupTestUsers();
});

describe("crash recovery", () => {
  it("T5.2-1 a job abandoned mid-request is picked up again and completed", async () => {
    const { g, ids } = await room(["were you lost?"]);
    await crash(ids[0], 600);
    const m = model();
    expect(await processGroup(g, { db: admin, generate: m.generate })).toMatchObject({ processed: 1 });
    expect(await replies(g)).toEqual(["re: Ann: were you lost?"]);
    expect(await jobOf(ids[0])).toMatchObject({ status: "succeeded", attempts: 2 });
  });

  it("T5.2-2 a job that is genuinely being worked on is left alone", async () => {
    const { g, ids } = await room(["in progress"]);
    await crash(ids[0], 1);
    const m = model();
    expect(await processGroup(g, { db: admin, generate: m.generate })).toMatchObject({ processed: 0 });
    expect(m.calls).toHaveLength(0);
    expect((await jobOf(ids[0])).status).toBe("processing");
  });

  it("T5.2-3 if the presumed-dead request finishes late, there is still only one reply", async () => {
    const { g, ids } = await room(["late finisher"]);
    const original = await jobOf(ids[0]);
    await crash(ids[0], 600);
    await processGroup(g, { db: admin, generate: model().generate }); // recovery run completes it
    const late = await admin.rpc("complete_job", { p_job_id: original.id, p_content: "from the zombie" });
    expect(late.data).toBe(false);
    expect(await replies(g)).toEqual(["re: Ann: late finisher"]);
  });

  it("T5.2-4 a job that keeps getting abandoned ends as failed (timeout), not endless", async () => {
    const { g, ids } = await room(["cursed"]);
    await crash(ids[0], 600, 3);
    const m = model();
    await processGroup(g, { db: admin, generate: m.generate });
    expect(m.calls).toHaveLength(0);
    expect(await jobOf(ids[0])).toMatchObject({ status: "failed", error_category: "timeout" });
    expect(await replies(g)).toHaveLength(0);
  });

  it("T5.2-5 an abandoned older job is answered before the newer ones", async () => {
    const { g, ids } = await room(["old one", "new one"]);
    await crash(ids[0], 600);
    await processGroup(g, { db: admin, generate: model().generate });
    expect(await replies(g)).toEqual(["re: Ann: old one", "re: Ann: new one"]);
  });
});

describe("failure handling through the processor", () => {
  it("T5.1-2 after a quota error no further provider calls are made during the cool-down", async () => {
    const { g, ids } = await room(["first", "second", "third"]);
    const m = model(new AiError("quota"));
    const result = await processGroup(g, { db: admin, generate: m.generate });
    expect(result).toMatchObject({ processed: 0, failed: 1 });
    expect(m.calls).toHaveLength(1); // second and third were not even attempted
    expect(await processGroup(g, { db: admin, generate: m.generate })).toMatchObject({ processed: 0, failed: 0 });
    expect(m.calls).toHaveLength(1);
    expect((await jobOf(ids[1])).status).toBe("queued");
    expect((await jobOf(ids[0])).error_category).toBe("quota");
  });

  it("T5.1-10 once the cool-down has passed the remaining messages are answered", async () => {
    const { g, ids } = await room(["first", "second"]);
    await processGroup(g, { db: admin, generate: model(new AiError("quota")).generate });
    await admin.from("ai_jobs").update({ cooldown_until: new Date(Date.now() - 1000).toISOString() }).eq("trigger_message_id", ids[0]);
    await processGroup(g, { db: admin, generate: model().generate });
    expect(await replies(g)).toEqual(["re: Ann: second"]);
    expect((await jobOf(ids[0])).status).toBe("failed"); // the failed one stays failed until a member retries it
  });

  it("T5.1-3 a retried job yields exactly one reply", async () => {
    const { g, ids } = await room(["try again"]);
    await processGroup(g, { db: admin, generate: model(new AiError("provider")).generate });
    const j = await jobOf(ids[0]);
    expect((await a.client.rpc("retry_job", { p_job_id: j.id })).data).toBe("queued");
    await processGroup(g, { db: admin, generate: model().generate });
    expect(await replies(g)).toEqual(["re: Ann: try again"]);
    expect(await jobOf(ids[0])).toMatchObject({ status: "succeeded", attempts: 2 });
  });
});
