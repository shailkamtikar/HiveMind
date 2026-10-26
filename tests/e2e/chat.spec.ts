import { expect, test, type Page } from "@playwright/test";
import { admin } from "../helpers/users";
import { cleanupTestUsers, signedInContext } from "./helpers";

test.afterAll(async () => {
  await cleanupTestUsers();
});

async function createGroupAndOpen(page: Page, name: string) {
  await page.getByLabel("New conversation").fill(name);
  await page.getByRole("button", { name: "Start conversation" }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  const groupId = page.url().split("/").pop()!;
  await expect(page.locator("#composer")).toBeVisible();
  return groupId;
}

const messages = (page: Page) => page.getByTestId("message");

test("T2.2-1 a sent message appears and survives a refresh", async ({ browser }) => {
  const { context, page } = await signedInContext(browser, "chat1");
  await createGroupAndOpen(page, "Chat one");
  await expect(page.getByText("No messages yet")).toBeVisible();

  await page.locator("#composer").fill("hello world");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(messages(page)).toHaveCount(1);
  await expect(messages(page).first()).toContainText("hello world");
  await expect(messages(page).first()).toHaveAttribute("data-status", "sent");
  await expect(messages(page).first()).toContainText("You");

  await page.reload();
  await expect(messages(page)).toHaveCount(1);
  await expect(messages(page).first()).toContainText("hello world");
  await context.close();
});

test("Enter sends and Shift+Enter inserts a new line", async ({ browser }) => {
  const { context, page } = await signedInContext(browser, "chat2");
  await createGroupAndOpen(page, "Keys");
  const box = page.locator("#composer");
  await box.fill("line one");
  await box.press("Shift+Enter");
  await box.pressSequentially("line two");
  await expect(messages(page)).toHaveCount(0);
  await box.press("Enter");
  await expect(messages(page)).toHaveCount(1);
  await expect(messages(page).first()).toContainText("line one");
  await expect(messages(page).first()).toContainText("line two");
  await expect(box).toHaveValue("");
  await context.close();
});

test("T2.2-2 / T2.2-3 empty and oversized messages cannot be sent", async ({ browser }) => {
  const { context, page } = await signedInContext(browser, "chat3");
  await createGroupAndOpen(page, "Limits");
  const send = page.getByRole("button", { name: "Send" });
  await expect(send).toBeDisabled();
  await page.locator("#composer").fill("    ");
  await expect(send).toBeDisabled();

  await page.locator("#composer").fill("x".repeat(1001));
  await expect(send).toBeDisabled();
  await expect(page.getByTestId("char-count")).toHaveText("1001/1000");

  await page.locator("#composer").fill("x".repeat(1000));
  await expect(send).toBeEnabled();
  await context.close();
});

test("T2.2-6 markup in a message is shown as text and never runs", async ({ browser }) => {
  const { context, page } = await signedInContext(browser, "chat4");
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  await createGroupAndOpen(page, "Safe");
  const payload = `<img src=x onerror="alert(1)"><b>bold</b>`;
  await page.locator("#composer").fill(payload);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(messages(page).first()).toContainText(payload);
  // Wait until the server has stored it before reloading.
  await expect(messages(page).first()).toHaveAttribute("data-status", "sent");
  await page.reload();
  await expect(messages(page).first()).toContainText(payload);
  await expect(messages(page).first().locator("img, b")).toHaveCount(0);
  expect(dialogs).toEqual([]);
  await context.close();
});

test("T2.2-7 a failed send shows an error and Retry sends it exactly once", async ({ browser }) => {
  const { user, context, page } = await signedInContext(browser, "chat5");
  const groupId = await createGroupAndOpen(page, "Flaky");

  let block = true;
  await page.route("**/api/groups/*/messages", (route) => {
    if (route.request().method() === "POST" && block) return route.abort();
    return route.continue();
  });

  await page.locator("#composer").fill("please arrive");
  await page.getByRole("button", { name: "Send" }).click();
  const item = messages(page).first();
  await expect(item).toHaveAttribute("data-status", "failed");
  await expect(item).toContainText("Check your connection");
  expect((await admin.from("messages").select("id").eq("group_id", groupId)).data).toHaveLength(0);

  block = false;
  await item.getByRole("button", { name: "Retry" }).click();
  await expect(item).toHaveAttribute("data-status", "sent");
  await expect(messages(page)).toHaveCount(1);
  const stored = await admin.from("messages").select("content, sender_id").eq("group_id", groupId);
  expect(stored.data).toEqual([{ content: "please arrive", sender_id: user.id }]);
  await context.close();
});

test("T2.2-8 earlier messages load in pages with no duplicates", async ({ browser }) => {
  const { user, context, page } = await signedInContext(browser, "chat6");
  const groupId = await createGroupAndOpen(page, "Long");
  const rows = Array.from({ length: 75 }, (_, i) => ({
    group_id: groupId,
    sender_id: user.id,
    type: "user",
    content: `msg ${String(i + 1).padStart(2, "0")}`,
  }));
  expect((await admin.from("messages").insert(rows)).error).toBeNull();

  await page.reload();
  await expect(messages(page)).toHaveCount(30);
  await expect(messages(page).last()).toContainText("msg 75");

  await page.getByRole("button", { name: "Load earlier messages" }).click();
  await expect(messages(page)).toHaveCount(60);
  await page.getByRole("button", { name: "Load earlier messages" }).click();
  await expect(messages(page)).toHaveCount(75);
  await expect(page.getByRole("button", { name: "Load earlier messages" })).toHaveCount(0);

  const texts = await messages(page).allInnerTexts();
  const nums = texts.map((t) => Number(/msg (\d+)/.exec(t)![1]));
  expect(nums).toEqual(Array.from({ length: 75 }, (_, i) => i + 1));
  await context.close();
});

test("T2.2-11 the entrance animation is off when the user prefers reduced motion", async ({ browser }) => {
  const motion = await signedInContext(browser, "chat7");
  await createGroupAndOpen(motion.page, "Motion");
  await motion.page.locator("#composer").fill("with motion");
  await motion.page.getByRole("button", { name: "Send" }).click();
  await expect(messages(motion.page)).toHaveCount(1);
  const normal = await messages(motion.page).first().evaluate((el) => getComputedStyle(el).animationName);
  expect(normal).toBe("message-in");
  await motion.context.close();

  const reduced = await signedInContext(browser, "chat8");
  await reduced.page.emulateMedia({ reducedMotion: "reduce" });
  await createGroupAndOpen(reduced.page, "Calm");
  await reduced.page.locator("#composer").fill("no motion");
  await reduced.page.getByRole("button", { name: "Send" }).click();
  await expect(messages(reduced.page)).toHaveCount(1);
  const duration = await messages(reduced.page).first().evaluate((el) => getComputedStyle(el).animationDuration);
  expect(parseFloat(duration)).toBeLessThan(0.001);
  await reduced.context.close();
});
