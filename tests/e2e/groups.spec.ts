import { expect, test } from "@playwright/test";
import { admin } from "../helpers/users";
import { cleanupTestUsers, signedInContext } from "./helpers";

test.afterAll(async () => {
  await cleanupTestUsers();
});

test("T1.3-3 new user sees the empty state", async ({ browser }) => {
  const { context, page } = await signedInContext(browser, "empty");
  await expect(page.getByText("Nothing here yet")).toBeVisible();
  await context.close();
});

test("T1.3-1 create a group and land on it", async ({ browser }) => {
  const { context, page } = await signedInContext(browser, "creator");
  await page.getByLabel("New conversation").fill("Trip planning");
  await page.getByRole("button", { name: "Start conversation" }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Trip planning" })).toBeVisible();
  await expect(page.getByText("Members (1/5)")).toBeVisible();
  await expect(page.getByText("Owner")).toBeVisible();
  await context.close();
});

test("T1.3-6 validation errors for empty and over-long names", async ({ browser }) => {
  const { context, page } = await signedInContext(browser, "validate");
  const button = page.getByRole("button", { name: "Start conversation" });

  await page.getByLabel("New conversation").fill("   ");
  await button.click();
  await expect(page.getByText("Give the conversation a name.")).toBeVisible();

  await page.getByLabel("New conversation").fill("x".repeat(81));
  await button.click();
  await expect(page.getByText(/under 81 characters/)).toBeVisible();

  await expect(page).toHaveURL(/\/groups$/);
  await expect(page.getByText("Nothing here yet")).toBeVisible();
  await context.close();
});

test("T1.3-7 a fast double click creates only one group", async ({ browser }) => {
  const { user, context, page } = await signedInContext(browser, "double");
  await page.getByLabel("New conversation").fill("Once only");
  await page.getByRole("button", { name: "Start conversation" }).dblclick();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  const { data } = await admin.from("groups").select("id").eq("owner_id", user.id);
  expect(data).toHaveLength(1);
  await context.close();
});

test("T1.3-2 / T1.3-4 / T1.3-5 each user sees only their groups; guessed ids give 404", async ({ browser }) => {
  const a = await signedInContext(browser, "ownerA");
  const b = await signedInContext(browser, "ownerB");

  await a.page.getByLabel("New conversation").fill("Alpha one");
  await a.page.getByRole("button", { name: "Start conversation" }).click();
  await a.page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  const alphaUrl = a.page.url();
  await a.page.goto("/groups");
  await a.page.getByLabel("New conversation").fill("Alpha two");
  await a.page.getByRole("button", { name: "Start conversation" }).click();
  await a.page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);

  await b.page.goto("/groups");
  await b.page.getByLabel("New conversation").fill("Beta only");
  await b.page.getByRole("button", { name: "Start conversation" }).click();
  await b.page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);

  await a.page.goto("/groups");
  await expect(a.page.getByRole("link", { name: /Alpha one/ })).toBeVisible();
  await expect(a.page.getByRole("link", { name: /Alpha two/ })).toBeVisible();
  await expect(a.page.getByText("Beta only")).toHaveCount(0);

  await b.page.goto("/groups");
  await expect(b.page.getByRole("link", { name: /Beta only/ })).toBeVisible();
  await expect(b.page.getByText(/Alpha/)).toHaveCount(0);

  // B opens A's real group id: same 404 as a non-existent group.
  // (The page streams, so the HTTP status is already 200; what matters is what the user can see.)
  const bodyOf = async (url: string) => {
    await b.page.goto(url);
    await expect(b.page.getByText("Conversation not found")).toBeVisible();
    return b.page.locator("main, body").first().innerText();
  };
  const forbidden = await bodyOf(alphaUrl);
  expect(forbidden).not.toContain("Alpha one");

  // Malformed and unknown ids look exactly the same as a real group you cannot access.
  const unknown = await bodyOf("/groups/00000000-0000-4000-8000-000000000000");
  const malformed = await bodyOf("/groups/not-a-uuid");
  expect(unknown).toBe(forbidden);
  expect(malformed).toBe(forbidden);

  await a.context.close();
  await b.context.close();
});

test("T1.3-8 signed-out visitors are sent to login and keep their destination", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/groups/3f2b8c1e-5a4d-4e7f-9b2a-1c3d5e7f9a0b");
  await expect(page).toHaveURL(/\/login\?next=%2Fgroups%2F3f2b8c1e/);
  await context.close();
});
