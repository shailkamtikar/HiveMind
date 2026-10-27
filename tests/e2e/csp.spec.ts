import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { admin, deleteUserByEmail } from "../helpers/users";

// T5.4-7: runs against a PRODUCTION build (port 3300) with the real Content-Security-Policy, and checks that
// the app still works end to end with it and that the browser reports no policy violations.
const email = `hm-test-csp-${randomBytes(4).toString("hex")}@example.com`;
test.afterAll(async () => {
  await deleteUserByEmail(email);
});

test("the production build sends the CSP and the whole app works under it", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/content security policy|refused to (load|connect|execute|apply)/i.test(m.text())) violations.push(m.text());
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => console.error("CSP violation: " + e.violatedDirective + " " + e.blockedURI));
  });

  const response = await page.goto("/login");
  const csp = response!.headers()["content-security-policy"];
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toContain("unsafe-eval");
  expect(response!.headers()["strict-transport-security"]).toContain("max-age=");

  // Sign up (server action), create a conversation, chat, open the share dialog, load realtime.
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Your name").fill("Csp Check");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-9");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/groups");

  await page.getByLabel("New conversation").fill("CSP room");
  await page.getByRole("button", { name: "Start conversation" }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  await expect(page.locator("#composer")).toBeVisible();
  await page.waitForTimeout(2500); // let the realtime websocket connect

  await page.locator("#composer").fill("hello under csp");
  await page.locator("#composer").press("Enter");
  await expect(page.locator('[data-testid="message"][data-status="sent"]')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByTestId("connection-banner")).toHaveCount(0); // the websocket to Supabase was allowed

  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  expect(violations, violations.join("\n")).toEqual([]);
  const { data } = await admin.from("messages").select("content").eq("content", "hello under csp");
  expect(data!.length).toBeGreaterThan(0);
});

test("pages cannot be framed and send nosniff", async ({ request }) => {
  const res = await request.get("/login");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["permissions-policy"]).toContain("camera=()");
  expect(res.headers()["referrer-policy"]).toBe("no-referrer");
});

test("T6.1-9 GSAP, Lenis and three.js are loaded on the landing page and nowhere in the chat", async ({ page }) => {
  // Each script is filed under the page it was requested for, so a big landing-page file that finishes
  // downloading late cannot be mistaken for something the chat loaded.
  let phase: "landing" | "chat" = "landing";
  const requestedIn = new WeakMap<object, string>();
  const scripts: { url: string; body: string; phase: string }[] = [];
  page.on("request", (r) => requestedIn.set(r, phase));
  page.on("response", async (r) => {
    if (r.request().resourceType() === "script") scripts.push({ url: r.url(), body: await r.text().catch(() => ""), phase: requestedIn.get(r.request()) ?? phase });
  });
  const has = (which: string) => {
    const mine = scripts.filter((s) => s.phase === which);
    return {
      gsap: mine.some((s) => /GreenSock|gsap\.registerPlugin|ScrollTrigger/.test(s.body)),
      lenis: mine.some((s) => /lenis-smooth|lenis-stopped/.test(s.body)),
      three: mine.some((s) => /WebGLRenderer/.test(s.body)),
    };
  };

  await page.goto("/");
  await expect.poll(() => Object.values(has("landing")).every(Boolean), { timeout: 20_000 }).toBe(true); // the check can tell them apart

  phase = "chat";
  const newEmail = `hm-test-scope-${randomBytes(4).toString("hex")}@example.com`;
  try {
    await page.goto("/login?mode=signup");
    await page.getByLabel("Your name").fill("Scope Check");
    await page.getByLabel("Email").fill(newEmail);
    await page.getByLabel("Password").fill("correct-horse-9");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/groups");
    await page.getByLabel("New conversation").fill("Scope room");
    await page.getByRole("button", { name: "Start conversation" }).click();
    await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
    await expect(page.locator("#composer")).toBeVisible();
    await page.waitForTimeout(1500);
    expect(scripts.filter((s) => s.phase === "chat").length).toBeGreaterThan(0);
    expect(has("chat")).toEqual({ gsap: false, lenis: false, three: false });
    // Native scrolling in the chat: no Lenis class on the document.
    expect(await page.evaluate(() => document.documentElement.classList.contains("lenis"))).toBe(false);
  } finally {
    await deleteUserByEmail(newEmail);
  }
});

test("opening a conversation and going back show a placeholder at once, even when the server is slow", async ({ page }) => {
  const email2 = `hm-test-snappy-${randomBytes(4).toString("hex")}@example.com`;
  try {
    await page.goto("/login?mode=signup");
    await page.getByLabel("Your name").fill("Snappy");
    await page.getByLabel("Email").fill(email2);
    await page.getByLabel("Password").fill("correct-horse-9");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/groups");
    await page.getByLabel("New conversation").fill("test");
    await page.getByRole("button", { name: "Start conversation" }).click();
    await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
    await page.goto("/groups");
    await expect(page.getByRole("link", { name: /test/ })).toBeVisible();
    await page.waitForTimeout(1500); // let the links' shells be prefetched, as they are for a real visitor

    // The server answers the conversation page 2.5 seconds late, as if it were far away.
    await page.route(/\/groups\/[0-9a-f-]{36}/, async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    const started = Date.now();
    await page.getByRole("link", { name: /test/ }).click();
    await expect(page.getByRole("status", { name: "Opening the conversation" })).toBeVisible({ timeout: 1500 });
    expect(Date.now() - started).toBeLessThan(1500);
    await expect(page.locator("#composer")).toBeVisible({ timeout: 20_000 });

    // And back to the list: its own placeholder shows straight away.
    await page.unroute(/\/groups\/[0-9a-f-]{36}/);
    await page.route(/\/groups(\?|$)/, async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    await page.getByRole("link", { name: /All conversations/ }).click();
    await expect(page.getByRole("status", { name: "Loading your conversations" })).toBeVisible({ timeout: 1500 });
    await expect(page.getByRole("heading", { name: "Your conversations" })).toBeVisible({ timeout: 20_000 });
  } finally {
    await deleteUserByEmail(email2);
  }
});
