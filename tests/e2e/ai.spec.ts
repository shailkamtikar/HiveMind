import { expect, test, type Page } from "@playwright/test";
import { admin } from "../helpers/users";
import { cleanupTestUsers, twoMembers } from "./helpers";

// Runs against the mock-AI server (port 3200): replies are "Mock reply to: <text>" after a short delay,
// and "[fail:quota]" (etc.) in a message makes the mock fail that way.
test.afterAll(async () => {
  await cleanupTestUsers();
});

const messages = (p: Page) => p.getByTestId("message");
const assistant = (p: Page) => p.locator('[data-testid="message"][data-type="assistant"]');
const send = async (p: Page, text: string) => {
  await p.locator("#composer").fill(text);
  await p.locator("#composer").press("Enter");
};

test("T4.5-1 / T4.5-2 both members see the message, a thinking indicator, then one reply in plain text", async ({ browser }) => {
  const { a, b } = await twoMembers(browser);
  await send(a.page, "hello <b>there</b> **friend**");

  for (const page of [a.page, b.page]) {
    await expect(messages(page).first()).toContainText("hello");
    await expect(page.getByTestId("ai-thinking")).toBeVisible({ timeout: 10_000 });
  }
  for (const page of [a.page, b.page]) {
    await expect(assistant(page)).toHaveCount(1, { timeout: 20_000 });
    await expect(assistant(page)).toContainText("HiveMind");
    await expect(assistant(page)).toContainText("Mock reply to: hello <b>there</b> **friend**"); // shown as text
    await expect(page.getByTestId("ai-thinking")).toHaveCount(0);
  }
  const { data } = await admin.from("messages").select("job_id").eq("type", "assistant");
  expect(data!.filter((m) => m.job_id)).not.toHaveLength(0);
  await a.context.close();
  await b.context.close();
});

test("T4.5-3 rapid messages show how many are waiting and are answered in order", async ({ browser }) => {
  const { a, b, groupId } = await twoMembers(browser);
  for (const t of ["first", "second", "third"]) await send(a.page, t);

  await expect(b.page.getByTestId("ai-waiting")).toBeVisible({ timeout: 15_000 });
  await expect(assistant(b.page)).toHaveCount(3, { timeout: 40_000 });

  const rows = (await admin.from("messages").select("type, content, seq").eq("group_id", groupId).order("seq")).data!;
  const replies = rows.filter((r) => r.type === "assistant").map((r) => r.content);
  expect(replies).toEqual(["Mock reply to: first", "Mock reply to: second", "Mock reply to: third"]);
  // Every reply comes after the message it answers.
  const userSeqs = rows.filter((r) => r.type === "user").map((r) => r.seq);
  const replySeqs = rows.filter((r) => r.type === "assistant").map((r) => r.seq);
  replySeqs.forEach((s, i) => expect(s).toBeGreaterThan(userSeqs[i]));
  await a.context.close();
  await b.context.close();
});

test("T4.5-4 someone who opens the conversation later sees the full history including AI replies", async ({ browser }) => {
  const { a, url } = await twoMembers(browser);
  await send(a.page, "before the latecomer");
  await expect(assistant(a.page)).toHaveCount(1, { timeout: 20_000 });

  const late = await (await import("./helpers")).signedInContext(browser, "late");
  const { groupId } = { groupId: url.split("/").pop()! };
  await admin.from("group_members").insert({ group_id: groupId, user_id: late.user.id, role: "member" });
  await late.page.goto(url);
  await expect(messages(late.page)).toHaveCount(2);
  await expect(assistant(late.page)).toContainText("Mock reply to: before the latecomer");
  await a.context.close();
  await late.context.close();
});

test("T4.5-5 a job left queued with nobody working on it is picked up when the page opens", async ({ browser }) => {
  const { a, groupId, url } = await twoMembers(browser);
  // A message that arrives while no one has the chat open and no server request is running.
  await admin.from("messages").insert({ group_id: groupId, sender_id: a.user.id, type: "user", content: "left behind" });
  const { data } = await admin.from("ai_jobs").select("status").eq("group_id", groupId);
  expect(data).toEqual([{ status: "queued" }]);

  await a.page.goto(url);
  await expect(assistant(a.page)).toHaveCount(1, { timeout: 25_000 });
  await expect(assistant(a.page)).toContainText("Mock reply to: left behind");
  await a.context.close();
});

test("a quota failure says HiveMind is temporarily unavailable and survives a reload", async ({ browser }) => {
  const { a } = await twoMembers(browser);
  await send(a.page, "quota please [fail:quota]");
  await expect(a.page.getByTestId("ai-failed")).toBeVisible({ timeout: 20_000 });
  await expect(a.page.getByTestId("ai-failed")).toContainText("temporarily unavailable");
  await expect(assistant(a.page)).toHaveCount(0);
  await a.page.reload();
  await expect(a.page.getByTestId("ai-failed")).toHaveCount(1);
  await a.context.close();
});

test("a failed reply shows a notice under the message, and the next message still gets answered", async ({ browser }) => {
  const { a, b } = await twoMembers(browser);
  await send(a.page, "please fail [fail:provider]");
  for (const page of [a.page, b.page]) {
    await expect(page.getByTestId("ai-failed")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("ai-failed")).toContainText("couldn't respond");
    await expect(assistant(page)).toHaveCount(0);
  }
  await send(b.page, "still there?");
  await expect(assistant(a.page)).toHaveCount(1, { timeout: 25_000 });
  await expect(assistant(a.page)).toContainText("Mock reply to: still there?");
  // The failure notice survives a reload: it is rendered from job state.
  await a.page.reload();
  await expect(a.page.getByTestId("ai-failed")).toHaveCount(1);
  await a.context.close();
  await b.context.close();
});

test("T5.1-3 / T5.1-4 Retry brings back exactly one reply, even when clicked twice", async ({ browser }) => {
  const { a, b, groupId } = await twoMembers(browser);
  await send(a.page, "flaky one [fail-once:provider]");
  await expect(a.page.getByTestId("ai-failed")).toBeVisible({ timeout: 20_000 });
  await expect(b.page.getByTestId("ai-failed")).toBeVisible({ timeout: 20_000 });

  const retry = a.page.getByRole("button", { name: "Retry" });
  await retry.dblclick();
  await expect(assistant(a.page)).toHaveCount(1, { timeout: 25_000 });
  await expect(assistant(b.page)).toContainText("Mock reply to: flaky one", { timeout: 25_000 });
  await expect(a.page.getByTestId("ai-failed")).toHaveCount(0);
  await a.page.waitForTimeout(3000);
  const { data } = await admin.from("messages").select("id").eq("group_id", groupId).eq("type", "assistant");
  expect(data).toHaveLength(1);
  await a.context.close();
  await b.context.close();
});

test("T5.1-5 a message that keeps failing can be retried only twice more, then the button is gone", async ({ browser }) => {
  const { a } = await twoMembers(browser);
  await send(a.page, "hopeless [fail:provider]");
  const failed = a.page.getByTestId("ai-failed");
  await expect(failed).toBeVisible({ timeout: 20_000 });
  for (let attempt = 2; attempt <= 3; attempt++) {
    await a.page.getByRole("button", { name: "Retry" }).click();
    await expect(a.page.getByTestId("ai-thinking")).toBeVisible({ timeout: 10_000 });
    await expect(a.page.getByTestId("ai-thinking")).toHaveCount(0, { timeout: 25_000 });
    await expect(failed).toBeVisible();
  }
  await expect(a.page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expect(a.page.getByTestId("ai-retry-limit")).toBeVisible();
  await a.context.close();
});
