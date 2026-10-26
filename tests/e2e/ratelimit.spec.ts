import { expect, test } from "@playwright/test";
import { admin } from "../helpers/users";
import { cleanupTestUsers, signedInContext } from "./helpers";

test.afterAll(async () => {
  await cleanupTestUsers();
});

test("T5.3-6 when throttled the message shows a friendly error with Retry, and the composer keeps working", async ({ browser }) => {
  const a = await signedInContext(browser, "rlui");
  await a.page.getByLabel("New conversation").fill("Throttle room");
  await a.page.getByRole("button", { name: "Start conversation" }).click();
  await a.page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  await expect(a.page.locator("#composer")).toBeVisible();

  // Use up this user's whole minute of messages.
  await Promise.all(
    Array.from({ length: 21 }, () =>
      admin.rpc("check_rate_limit", { p_user_id: a.user.id, p_bucket: "messages", p_max: 20, p_window_seconds: 60 }),
    ),
  );

  await a.page.locator("#composer").fill("over the limit");
  await a.page.locator("#composer").press("Enter");
  const failed = a.page.locator('[data-testid="message"][data-status="failed"]');
  await expect(failed).toHaveCount(1, { timeout: 10_000 });
  await expect(failed).toContainText("too fast");
  await expect(failed.getByRole("button", { name: "Retry" })).toBeVisible();

  // The composer is not broken: typing still works and nothing was stored.
  await a.page.locator("#composer").fill("typing continues");
  await expect(a.page.locator("#composer")).toHaveValue("typing continues");
  await expect(a.page.getByRole("button", { name: "Send" })).toBeEnabled();
  const { data } = await admin.from("messages").select("id").eq("sender_id", a.user.id);
  expect(data).toHaveLength(0);

  // Once the window has passed, Retry delivers the same message exactly once.
  await admin.from("rate_limits").delete().eq("user_id", a.user.id);
  await failed.getByRole("button", { name: "Retry" }).click();
  await expect(a.page.locator('[data-testid="message"][data-status="sent"]')).toHaveCount(1, { timeout: 10_000 });
  const after = await admin.from("messages").select("content").eq("sender_id", a.user.id);
  expect(after.data).toEqual([{ content: "over the limit" }]);
  await a.context.close();
});
