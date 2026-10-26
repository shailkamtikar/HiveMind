import type { Browser, BrowserContext, Page } from "@playwright/test";
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
