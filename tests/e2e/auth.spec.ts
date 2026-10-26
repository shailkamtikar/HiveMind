import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { admin, deleteUserByEmail } from "../helpers/users";

const emails: string[] = [];
const newEmail = () => {
  const e = `hm-test-pw-${randomBytes(4).toString("hex")}@example.com`;
  emails.push(e);
  return e;
};
const PASSWORD = "correct-horse-9";

test.afterAll(async () => {
  for (const e of emails) await deleteUserByEmail(e);
});

async function signUp(page: Page, name: string, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
}

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
}

test("the login page offers a password form and no email-link option", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByText(/sign-in link|magic link/i)).toHaveCount(0);
});

test("creating an account signs you in with the chosen name", async ({ page }) => {
  const email = newEmail();
  await signUp(page, "Ada Lovelace", email);
  await page.waitForURL("**/groups");
  await expect(page.getByText("Ada Lovelace").first()).toBeVisible();
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  const id = data.users.find((u) => u.email === email)!.id;
  const { data: profile } = await admin.from("profiles").select("display_name").eq("id", id).single();
  expect(profile!.display_name).toBe("Ada Lovelace");
});

test("a user can sign out and sign back in with their password", async ({ page }) => {
  const email = newEmail();
  await signUp(page, "Grace", email);
  await page.waitForURL("**/groups");
  await signOut(page);
  await signIn(page, email, PASSWORD);
  await page.waitForURL("**/groups");
  await expect(page.getByRole("heading", { name: "Your conversations" })).toBeVisible();
});

test("a wrong password is rejected with a generic message and keeps the email", async ({ page }) => {
  const email = newEmail();
  await signUp(page, "Linus", email);
  await page.waitForURL("**/groups");
  await signOut(page);

  await signIn(page, email, "not-the-password");
  await expect(page.getByTestId("form-error")).toContainText("Incorrect email or password.");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByLabel("Email")).toHaveValue(email);
  // An unknown account gets the very same message.
  await signIn(page, `hm-test-nobody-${randomBytes(3).toString("hex")}@example.com`, PASSWORD);
  await expect(page.getByTestId("form-error")).toContainText("Incorrect email or password.");
});

test("sign-up validates input and creates nothing when it is invalid", async ({ page }) => {
  const email = newEmail();
  await signUp(page, "Short", email, "short");
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  expect(data.users.some((u) => u.email === email)).toBe(false);
});

test("signing up with an email that already has an account says so", async ({ page, browser }) => {
  const email = newEmail();
  await signUp(page, "First", email);
  await page.waitForURL("**/groups");
  const context = await browser.newContext();
  const other = await context.newPage();
  await signUp(other, "Second", email, "another-password-1");
  await expect(other.getByTestId("form-error")).toContainText("already exists");
  await context.close();
});

test("after signing in you land where you were headed", async ({ page }) => {
  const email = newEmail();
  await signUp(page, "Dest", email);
  await page.waitForURL("**/groups");
  await signOut(page);

  const target = "/groups/3f2b8c1e-0000-4000-8000-000000000000";
  await page.goto(target);
  await expect(page).toHaveURL(/\/login\?next=/);
  await signIn(page, email, PASSWORD);
  await page.waitForURL(`**${target}`);
});

test("an unsafe next value cannot redirect off-site after sign-in", async ({ page }) => {
  const email = newEmail();
  await signUp(page, "Safe", email);
  await page.waitForURL("**/groups");
  await signOut(page);
  await page.goto("/login?next=//evil.com");
  await signIn(page, email, PASSWORD);
  await page.waitForURL("**/groups");
  expect(new URL(page.url()).hostname).toBe("localhost");
});
