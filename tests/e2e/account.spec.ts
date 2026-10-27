import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { admin, cleanupTestUsers, createTestUser } from "../helpers/users";
import { cleanupTestUsers as cleanup, signedInContext } from "./helpers";

void cleanupTestUsers;
test.afterAll(async () => {
  await cleanup();
});

const OLD = "old-password-91";
const NEW = "brand-new-pass-77";

/** A user with a known password, signed out. */
async function userWithPassword() {
  const user = await createTestUser("acct");
  await admin.auth.admin.updateUserById(user.id, { password: OLD });
  return user;
}

async function signInWith(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test.describe("forgot password", () => {
  test("the sign-in page links to it, and asking never reveals whether an account exists", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByRole("heading", { name: "Forgot your password?" })).toBeVisible();

    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: "Send me a reset link" }).click();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();

    // An address nobody registered gets the very same friendly answer (and no email is sent).
    await page.getByLabel("Email").fill(`hm-test-nobody-${randomBytes(3).toString("hex")}@example.com`);
    await page.getByRole("button", { name: "Send me a reset link" }).click();
    await expect(page.getByTestId("forgot-sent")).toContainText("If there is an account");
  });

  test("the emailed link signs you in, you choose a new password, and the old one stops working", async ({ browser }) => {
    const user = await userWithPassword();
    const { data } = await admin.auth.admin.generateLink({ type: "recovery", email: user.email });
    const context = await browser.newContext();
    // The "forgot password" page remembers where the link should lead; set the same thing here.
    await context.addCookies([{ name: "hm_next", value: "/reset-password", url: "http://localhost:3100" }]);
    const page = await context.newPage();
    await page.goto(`/auth/callback?token_hash=${data.properties!.hashed_token}&type=recovery`);
    await page.waitForURL("**/reset-password");
    await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();

    // Checks come first: too short, and two different passwords.
    await page.getByLabel("New password").fill("short");
    await page.getByLabel("Type it again").fill("short");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
    await page.getByLabel("New password").fill(NEW);
    await page.getByLabel("Type it again").fill(NEW + "x");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText("The two passwords do not match.")).toBeVisible();

    await page.getByLabel("New password").fill(NEW);
    await page.getByLabel("Type it again").fill(NEW);
    await page.getByRole("button", { name: "Save new password" }).click();
    await page.waitForURL("**/groups");
    await context.close();

    // The new password works; the old one does not.
    const fresh = await browser.newContext();
    const p2 = await fresh.newPage();
    await signInWith(p2, user.email, OLD);
    await expect(p2.getByTestId("form-error")).toContainText("Incorrect email or password.");
    await p2.getByLabel("Password").fill(NEW);
    await p2.getByRole("button", { name: "Sign in", exact: true }).click();
    await p2.waitForURL("**/groups");
    await fresh.close();
  });

  test("the choose-a-password page needs a signed-in session", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page).toHaveURL(/\/login\?next=%2Freset-password/);
  });

  test("a used or invalid reset link says so and points back to sign in", async ({ page }) => {
    await page.goto("/auth/callback?token_hash=bogus&type=recovery");
    await expect(page).toHaveURL(/\/login\?error=link/);
    await expect(page.getByText(/invalid or has expired/)).toBeVisible();
  });
});

test.describe("getting around when signed in", () => {
  test("the HiveMind logo goes to the landing page from anywhere", async ({ browser }) => {
    const a = await signedInContext(browser, "logo");
    await a.page.getByLabel("New conversation").fill("Logo room");
    await a.page.getByRole("button", { name: "Start conversation" }).click();
    await a.page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
    for (const from of [a.page.url(), "/groups", "/privacy"]) {
      await a.page.goto(from);
      await a.page.getByRole("link", { name: /HiveMind/ }).first().click();
      await expect(a.page).toHaveURL(/\/$/);
      await expect(a.page.getByRole("heading", { level: 1 })).toHaveAccessibleName("One chat. Many minds. One AI.");
    }
    // The login and join pages have the logo as a link home too.
    await a.context.close();
    const anon = await browser.newContext();
    const page = await anon.newPage();
    await page.goto("/login");
    await page.getByRole("link", { name: /HiveMind/ }).first().click();
    await expect(page).toHaveURL(/\/$/);
    await anon.close();
  });

  test("when you are already signed in the landing buttons open your conversations instead of asking you to sign in", async ({ browser }) => {
    const a = await signedInContext(browser, "cta");
    await a.page.goto("/");
    const cards = a.page.locator(".tick-card");
    await expect(cards.first()).toHaveAttribute("href", "/groups", { timeout: 15_000 });
    await expect(cards.first()).toContainText("Open your conversations");
    await expect(a.page.getByRole("link", { name: "I already have an account" })).toHaveCount(0);
    await a.page.locator(".tick-card").last().scrollIntoViewIfNeeded();
    await expect(cards.last()).toHaveAttribute("href", "/groups");
    await cards.first().click();
    await a.page.waitForURL("**/groups");
    await a.context.close();
  });

  test("the sign-in page sends someone who is already signed in straight on", async ({ browser }) => {
    const a = await signedInContext(browser, "already");
    await a.page.goto("/login");
    await expect(a.page).toHaveURL(/\/groups$/);
    await a.page.goto("/login?next=%2Fprivacy");
    await expect(a.page).toHaveURL(/\/privacy$/);
    await a.page.goto("/login?next=//evil.com");
    await expect(a.page).toHaveURL(/\/groups$/); // an unsafe destination is ignored
    await a.context.close();
  });

  test("signed-out visitors still see the sign-up buttons", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".tick-card").first()).toHaveAttribute("href", "/login?mode=signup");
  });
});
