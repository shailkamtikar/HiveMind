import { expect, test, type Page } from "@playwright/test";
import { admin } from "../helpers/users";
import { cleanupTestUsers, signedInContext } from "./helpers";

test.afterAll(async () => {
  await cleanupTestUsers();
});

const messages = (page: Page) => page.getByTestId("message");

/** A owns a group; B is added as a member (invitations arrive in Phase 3). Both open the chat. */
async function twoMembers(browser: import("@playwright/test").Browser) {
  const a = await signedInContext(browser, "rtA");
  const b = await signedInContext(browser, "rtB");
  await admin.from("profiles").update({ display_name: "Alice" }).eq("id", a.user.id);
  await admin.from("profiles").update({ display_name: "Bob" }).eq("id", b.user.id);

  await a.page.getByLabel("New conversation").fill("Live chat");
  await a.page.getByRole("button", { name: "Start conversation" }).click();
  await a.page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  const url = a.page.url();
  const groupId = url.split("/").pop()!;
  await admin.from("group_members").insert({ group_id: groupId, user_id: b.user.id, role: "member" });

  await b.page.goto(url);
  await expect(b.page.locator("#composer")).toBeVisible();
  // Let both realtime subscriptions settle before sending.
  await a.page.waitForTimeout(2500);
  return { a, b, groupId, url };
}

test("T2.3-1 / T2.3-2 a message reaches the other member live, and the sender sees it once", async ({ browser }) => {
  const { a, b } = await twoMembers(browser);

  await a.page.locator("#composer").fill("hi Bob");
  await a.page.getByRole("button", { name: "Send" }).click();

  await expect(messages(b.page)).toHaveCount(1, { timeout: 10_000 });
  await expect(messages(b.page).first()).toContainText("hi Bob");
  await expect(messages(b.page).first()).toContainText("Alice");

  await expect(messages(a.page)).toHaveCount(1);
  await a.page.waitForTimeout(1500); // a late duplicate event would show up here
  await expect(messages(a.page)).toHaveCount(1);

  // And back the other way.
  await b.page.locator("#composer").fill("hi Alice");
  await b.page.getByRole("button", { name: "Send" }).click();
  await expect(messages(a.page)).toHaveCount(2, { timeout: 10_000 });
  await expect(messages(a.page).last()).toContainText("hi Alice");
  await expect(messages(a.page).last()).toContainText("Bob");

  await a.context.close();
  await b.context.close();
});

test("T2.3-4 rapid messages from both members end up identical and in the same order everywhere", async ({ browser }) => {
  const { a, b, groupId } = await twoMembers(browser);

  const burst = async (page: Page, who: string) => {
    for (let i = 1; i <= 10; i++) {
      await page.locator("#composer").fill(`${who} ${i}`);
      await page.locator("#composer").press("Enter");
    }
  };
  await Promise.all([burst(a.page, "A"), burst(b.page, "B")]);

  await expect(messages(a.page)).toHaveCount(20, { timeout: 20_000 });
  await expect(messages(b.page)).toHaveCount(20, { timeout: 20_000 });
  await expect(a.page.locator('[data-status="sent"]')).toHaveCount(20);

  const order = (page: Page) => messages(page).evaluateAll((els) => els.map((e) => e.querySelector("p:nth-of-type(2)")!.textContent));
  const [fromA, fromB] = [await order(a.page), await order(b.page)];
  expect(fromA).toEqual(fromB);

  // Same as the database order.
  const { data } = await admin.from("messages").select("content").eq("group_id", groupId).order("seq");
  expect(fromA).toEqual(data!.map((m) => m.content));
  // Each member's own messages stay in the order they were typed.
  expect(fromA.filter((t) => t!.startsWith("A "))).toEqual(Array.from({ length: 10 }, (_, i) => `A ${i + 1}`));
  expect(fromA.filter((t) => t!.startsWith("B "))).toEqual(Array.from({ length: 10 }, (_, i) => `B ${i + 1}`));

  await a.context.close();
  await b.context.close();
});

test("T2.3-5 leaving the conversation unsubscribes from realtime", async ({ browser }) => {
  const { a, b } = await twoMembers(browser);
  const sentFrames: string[] = [];
  b.page.on("websocket", (ws) => ws.on("framesent", (f) => sentFrames.push(String(f.payload))));
  // Reload so the listener sees the whole socket lifetime, then leave via in-app navigation.
  await b.page.reload();
  await expect(b.page.locator("#composer")).toBeVisible();
  await b.page.waitForTimeout(2000);
  expect(sentFrames.some((f) => f.includes("phx_join"))).toBe(true);

  await b.page.getByRole("link", { name: /All conversations/i }).click();
  await b.page.waitForURL(/\/groups$/);
  await expect.poll(() => sentFrames.some((f) => f.includes("phx_leave")), { timeout: 8000 }).toBe(true);

  await a.context.close();
  await b.context.close();
});
