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
  expect(res.headers()["referrer-policy"]).toBe("no-referrer");
});
