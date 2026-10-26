import { expect, test } from "@playwright/test";
import { admin } from "../helpers/users";
import { cleanupTestUsers, signedInContext } from "./helpers";

test.afterAll(async () => {
  await cleanupTestUsers();
});

test("thinking indicator, assistant reply and system notice show up live and render as plain text", async ({ browser }) => {
  const a = await signedInContext(browser, "aiA");
  await a.page.getByLabel("New conversation").fill("AI room");
  await a.page.getByRole("button", { name: "Start conversation" }).click();
  await a.page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  const groupId = a.page.url().split("/").pop()!;
  await expect(a.page.locator("#composer")).toBeVisible();
  await a.page.waitForTimeout(2500); // let realtime settle

  await a.page.locator("#composer").fill("hello bot");
  await a.page.locator("#composer").press("Enter");
  await expect(a.page.getByTestId("message")).toHaveCount(1);
  // Nothing has answered the member's message yet.
  await expect(a.page.getByTestId("ai-thinking")).toBeVisible();

  // The server writes the reply, exactly as the AI path does (service role, no sender).
  const reply = await admin
    .from("messages")
    .insert({ group_id: groupId, sender_id: null, type: "assistant", content: "Hi! I am the **assistant**." });
  expect(reply.error).toBeNull();
  const ai = a.page.locator('[data-testid="message"][data-type="assistant"]');
  await expect(ai).toHaveCount(1, { timeout: 10_000 });
  await expect(ai).toContainText("HiveMind");
  await expect(ai).toContainText("Hi! I am the **assistant**.");
  await expect(a.page.getByTestId("ai-thinking")).toHaveCount(0);

  await admin
    .from("messages")
    .insert({ group_id: groupId, sender_id: null, type: "system", content: "HiveMind couldn't reply just now." });
  const sys = a.page.locator('[data-testid="message"][data-type="system"]');
  await expect(sys).toHaveCount(1, { timeout: 10_000 });
  await expect(sys).toContainText("couldn't reply");
  await a.context.close();
});
