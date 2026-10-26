import { expect, test, type Page } from "@playwright/test";
import { admin } from "../helpers/users";
import { cleanupTestUsers, twoMembers } from "./helpers";

test.afterAll(async () => {
  await cleanupTestUsers();
});

const messages = (page: Page) => page.getByTestId("message");
const texts = (page: Page) => messages(page).evaluateAll((els) => els.map((e) => e.querySelector("p:nth-of-type(2)")!.textContent));
const dbOrder = async (groupId: string) =>
  (await admin.from("messages").select("content").eq("group_id", groupId).order("seq")).data!.map((m) => m.content);

async function send(page: Page, text: string) {
  await page.locator("#composer").fill(text);
  await page.locator("#composer").press("Enter");
}

test("T2.4-1 / T2.4-2 messages sent while offline appear after reconnecting, with a banner meanwhile", async ({ browser }) => {
  const { a, b, groupId } = await twoMembers(browser);
  await send(a.page, "before");
  await expect(messages(b.page)).toHaveCount(1, { timeout: 10_000 });

  await b.context.setOffline(true);
  await expect(b.page.getByTestId("connection-banner")).toBeVisible({ timeout: 10_000 });
  await expect(b.page.getByTestId("connection-banner")).toContainText(/offline/i);

  for (const t of ["while 1", "while 2", "while 3"]) await send(a.page, t);
  await expect(messages(a.page)).toHaveCount(4);

  await b.context.setOffline(false);
  await expect(messages(b.page)).toHaveCount(4, { timeout: 20_000 });
  await expect(b.page.getByTestId("connection-banner")).toHaveCount(0, { timeout: 20_000 });

  expect(await texts(b.page)).toEqual(["before", "while 1", "while 2", "while 3"]);
  expect(await texts(b.page)).toEqual(await dbOrder(groupId)); // T2.4-7
  await a.context.close();
  await b.context.close();
});

test("T2.4-3 sending is blocked while offline, the draft is kept, and nothing is silently queued", async ({ browser }) => {
  const { a, b, groupId } = await twoMembers(browser);
  await b.context.setOffline(true);
  await expect(b.page.getByTestId("connection-banner")).toBeVisible({ timeout: 10_000 });

  await b.page.locator("#composer").fill("typed offline");
  await expect(b.page.getByRole("button", { name: "Send" })).toBeDisabled();
  await expect(b.page.getByTestId("composer-hint-text")).toContainText("offline");
  await b.page.locator("#composer").press("Enter");
  await expect(messages(b.page)).toHaveCount(0);
  await expect(b.page.locator("#composer")).toHaveValue("typed offline");

  await b.context.setOffline(false);
  await expect(b.page.getByRole("button", { name: "Send" })).toBeEnabled({ timeout: 15_000 });
  expect(await dbOrder(groupId)).toEqual([]); // nothing was sent behind the user's back

  await b.page.getByRole("button", { name: "Send" }).click();
  await expect(messages(b.page)).toHaveCount(1);
  await expect(messages(a.page)).toHaveCount(1, { timeout: 10_000 });
  await a.context.close();
  await b.context.close();
});

test("T2.4-4 refreshing mid-conversation shows the same history without duplicates", async ({ browser }) => {
  const { a, b, groupId } = await twoMembers(browser);
  for (const t of ["one", "two", "three"]) await send(a.page, t);
  await expect(messages(b.page)).toHaveCount(3, { timeout: 15_000 });
  const before = await texts(b.page);

  await b.page.reload();
  await expect(messages(b.page)).toHaveCount(3);
  expect(await texts(b.page)).toEqual(before);
  await a.page.reload();
  await expect(messages(a.page)).toHaveCount(3);
  expect(await texts(a.page)).toEqual(await dbOrder(groupId));
  await a.context.close();
  await b.context.close();
});

test("T2.4-5 a long absence is filled in completely and in order, across several pages", async ({ browser }) => {
  const { a, b, groupId } = await twoMembers(browser);
  await send(a.page, "first");
  await expect(messages(b.page)).toHaveCount(1, { timeout: 10_000 });

  await b.context.setOffline(true);
  await expect(b.page.getByTestId("connection-banner")).toBeVisible({ timeout: 10_000 });
  const rows = Array.from({ length: 250 }, (_, i) => ({
    group_id: groupId,
    sender_id: a.user.id,
    type: "user",
    content: `bulk ${String(i + 1).padStart(3, "0")}`,
  }));
  expect((await admin.from("messages").insert(rows)).error).toBeNull();

  await b.context.setOffline(false);
  await expect(messages(b.page)).toHaveCount(251, { timeout: 30_000 });
  const got = await texts(b.page);
  expect(new Set(got).size).toBe(251);
  expect(got).toEqual(await dbOrder(groupId));
  await a.context.close();
  await b.context.close();
});

test("T2.4-6 a tab that missed live events catches up when it becomes visible again", async ({ browser }) => {
  const a = await (await import("./helpers")).signedInContext(browser, "visA");
  const b = await (await import("./helpers")).signedInContext(browser, "visB");

  // B's realtime socket is swallowed: it connects to nothing and never gets events.
  await b.page.routeWebSocket(/realtime/, () => {});

  await a.page.getByLabel("New conversation").fill("Hidden tab");
  await a.page.getByRole("button", { name: "Start conversation" }).click();
  await a.page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  const url = a.page.url();
  const groupId = url.split("/").pop()!;
  await admin.from("group_members").insert({ group_id: groupId, user_id: b.user.id, role: "member" });
  await b.page.goto(url);
  await expect(b.page.locator("#composer")).toBeVisible();

  await send(a.page, "missed live");
  await expect(messages(a.page)).toHaveCount(1);
  await b.page.waitForTimeout(2500);
  await expect(messages(b.page)).toHaveCount(0); // no live delivery reached B

  // The tab becomes visible again.
  await b.page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(messages(b.page)).toHaveCount(1, { timeout: 10_000 });
  await expect(messages(b.page).first()).toContainText("missed live");
  await a.context.close();
  await b.context.close();
});
