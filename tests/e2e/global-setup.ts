import { chromium } from "@playwright/test";
import { admin, cleanupTestUsers, createTestUser } from "../helpers/users";

/**
 * A fresh Next.js dev server compiles each route the first time it is requested and tells open pages to reload
 * when that happens. Doing that in the middle of the first real test made it flaky. This visits every page type
 * once, with a real signed-in browser, before any test runs.
 */
async function warm(baseURL: string) {
  const browser = await chromium.launch();
  const user = await createTestUser("warm");
  try {
    const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email: user.email });
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    const visit = async (path: string) => {
      // The first visit of a route can be interrupted by the dev server reloading the page; that is what this
      // step exists to get out of the way, so just try again.
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          await page.goto(path, { waitUntil: "load" });
          break;
        } catch {
          await page.waitForTimeout(1500);
        }
      }
      await page.waitForLoadState("networkidle").catch(() => undefined);
    };

    await visit("/login");
    await visit("/join/warmup-token-warmup-token-warmup-token-123");
    await visit(`/auth/callback?token_hash=${data!.properties!.hashed_token}&type=magiclink`);
    await page.waitForURL("**/groups", { timeout: 60_000 });
    await page.waitForLoadState("networkidle").catch(() => undefined);

    const groupId = (await user.client.rpc("create_group", { p_name: "Warm-up" })).data as string;
    await visit(`/groups/${groupId}`);
    // Exercise the API routes the pages use so they are compiled too.
    await page.evaluate(async (g) => {
      await fetch(`/api/groups/${g}/messages`);
      await fetch(`/api/groups/${g}/invitations`);
      await fetch(`/api/groups/${g}/ai/process`, { method: "POST" });
      await fetch("/api/me");
    }, groupId);
    await visit("/groups");
    await context.close();
  } finally {
    await browser.close();
    await cleanupTestUsers();
  }
}

export default async function globalSetup() {
  const urls = process.env.TEST_PROD ? ["http://localhost:3300"] : [process.env.TEST_BASE_URL ?? "http://localhost:3100", process.env.TEST_AI_URL ?? "http://localhost:3200"];
  for (const url of urls) await warm(url);
}
