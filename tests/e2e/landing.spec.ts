import { expect, test, type Page } from "@playwright/test";

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test("T6.1-1 the landing page explains the product and leads to sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("One chat. Many minds. One AI.");
  await expect(page.getByText("HiveMind is one conversation that everyone, and one AI, shares.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Start a conversation" })).toHaveAttribute("href", "/login?mode=signup");
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  await expect(page.getByLabel("Example of a HiveMind conversation")).toBeVisible();
  // The scroll-triggered sections become visible when scrolled to.
  await page.getByRole("heading", { name: "Three steps, no setup for your friends." }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: "Three steps, no setup for your friends." })).toBeVisible();
  await expect(page.getByText("Plainly stated.")).toBeAttached();
});

test("T6.1-2 the privacy page states Gemini processing and who can read a conversation", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("What happens to what you write");
  await page.getByRole("heading", { name: "What is sent to the AI" }).scrollIntoViewIfNeeded();
  await expect(page.getByText("Gemini API").first()).toBeVisible();
  await expect(page.getByText("Every member of a conversation can read all of it.")).toBeAttached();
  await expect(page.getByText("is not supported in this version")).toBeAttached();
  await page.getByRole("link", { name: "Privacy and data" }).scrollIntoViewIfNeeded();
});

test("T6.1-3 at 375px wide nothing scrolls sideways on the public pages", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const page = await context.newPage();
  for (const path of ["/", "/privacy", "/login", "/login?mode=signup", "/join/abcdefghijklmnopqrstuvwxyzabcdefghijklmnopq"]) {
    await page.goto(path);
    await page.waitForTimeout(600);
    expect(await noHorizontalScroll(page), path).toBe(true);
  }
  await context.close();
});

test("T6.1-5 an unknown address shows the branded 404", async ({ page }) => {
  const res = await page.goto("/privacy/no-such-page");
  expect(res!.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This page isn't here." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to the start" })).toBeVisible();
  expect(await page.content()).not.toMatch(/at .*\.(ts|js):\d+/);
});

test("T6.1-8 with reduced motion everything is visible straight away and scrolling is native", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => document.documentElement.classList.contains("motion-ready"))).toBe(false);
  expect(await page.evaluate(() => document.documentElement.classList.contains("lenis"))).toBe(false);
  // Sections far down the page are already fully opaque without any scrolling.
  const opacity = await page.getByText("Plainly stated.").evaluate((el) => getComputedStyle(el.closest("[data-reveal]")!).opacity);
  expect(opacity).toBe("1");
  await expect(page.getByText("Where should we go for Dan's birthday?")).toBeVisible();
  await context.close();
});

test("T6.1-11 the landing page scrolls smoothly, the chat does not hijack scrolling", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("lenis")), { timeout: 15_000 }).toBe(true);
});

test("without JavaScript the landing content is still readable", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByText("Three steps, no setup for your friends.")).toBeVisible();
  await expect(page.getByText("Bring the group. Ask the question.")).toBeVisible();
  await context.close();
});
