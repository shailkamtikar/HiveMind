import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { admin, createTestUser, type TestUser } from "../helpers/users";

export { cleanupTestUsers } from "../helpers/users";

/** Creates a test user and returns a browser context that is already signed in as them. */
export async function signedInContext(
  browser: Browser,
  label: string,
): Promise<{ user: TestUser; context: BrowserContext; page: Page }> {
  const user = await createTestUser(label);
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: user.email });
  if (error || !data.properties) throw new Error(`generateLink failed: ${error?.message}`);

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink`);
  await page.waitForURL("**/groups");
  return { user, context, page };
}

/** A owns a group; B is added as a member (invitations arrive in Phase 3). Both open the chat. */
export async function twoMembers(browser: Browser) {
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

