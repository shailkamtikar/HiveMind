import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { generateInviteToken } from "../../src/lib/invites/token";
import { admin, deleteUserByEmail } from "../helpers/users";
import { cleanupTestUsers, signedInContext } from "./helpers";

const emails: string[] = [];
test.afterAll(async () => {
  for (const e of emails) await deleteUserByEmail(e);
  await cleanupTestUsers();
});

/** A owns a group named `name` and the page is open on it. */
async function ownerWithGroup(browser: Parameters<typeof signedInContext>[0], label: string, name = "Invite room") {
  const a = await signedInContext(browser, label);
  await admin.from("profiles").update({ display_name: "Alice" }).eq("id", a.user.id);
  await a.page.getByLabel("New conversation").fill(name);
  await a.page.getByRole("button", { name: "Start conversation" }).click();
  await a.page.waitForURL(/\/groups\/[0-9a-f-]{36}$/);
  const groupId = a.page.url().split("/").pop()!;
  return { ...a, groupId };
}

/** Opens the Share dialog, acknowledges the notice and returns the created link. */
async function createLinkViaUi(page: Page) {
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.getByLabel("I understand and want to share this conversation.").check();
  await page.getByRole("button", { name: "Create invite link" }).click();
  const link = await page.locator("#invite-link").inputValue();
  expect(link).toMatch(/\/join\/[A-Za-z0-9_-]{43}$/);
  return link;
}

/** Stores an invitation directly so a test can control its state. */
async function storedInvite(groupId: string, over: { revoked?: boolean; expired?: boolean } = {}) {
  const { token, hash } = generateInviteToken();
  await admin.from("invitations").insert({
    group_id: groupId,
    token_hash: hash,
    expires_at: new Date(Date.now() + (over.expired ? -1000 : 3 * 86_400_000)).toISOString(),
    revoked_at: over.revoked ? new Date().toISOString() : null,
  });
  return `/join/${token}`;
}

test("T3.3-1 / T3.3-8 invite to join: a new person signs up from the link and lands in the chat with its history", async ({ browser }) => {
  const a = await ownerWithGroup(browser, "invA");
  await a.page.locator("#composer").fill("Welcome, this was said before you joined");
  await a.page.locator("#composer").press("Enter");
  await expect(a.page.getByTestId("message").first()).toHaveAttribute("data-status", "sent");

  const link = await createLinkViaUi(a.page);

  const context = await browser.newContext();
  const b = await context.newPage();
  await b.goto(link);
  await expect(b.getByTestId("join-signed-out")).toBeVisible();
  await b.getByRole("link", { name: "Create an account" }).click();
  await expect(b).toHaveURL(/\/login\?mode=signup&next=%2Fjoin%2F/);

  const email = `hm-test-inv-${randomBytes(4).toString("hex")}@example.com`;
  emails.push(email);
  await b.getByLabel("Your name").fill("Bea");
  await b.getByLabel("Email").fill(email);
  await b.getByLabel("Password").fill("correct-horse-9");
  await b.getByRole("button", { name: "Create account" }).click();

  await b.waitForURL(new RegExp(`/groups/${a.groupId}$`), { timeout: 30_000 });
  await expect(b.getByTestId("message").filter({ hasText: "Welcome, this was said before you joined" })).toHaveCount(1);
  await expect(b.getByText("Bea").first()).toBeVisible();
  // A sees the new member in the list.
  await a.page.reload();
  await expect(a.page.getByText("Bea")).toBeVisible();
  await context.close();
  await a.context.close();
});

test("T3.3-2 / T3.3-11 the privacy notice comes first, nothing is created until it is acknowledged, and the dialog is keyboard friendly", async ({ browser }) => {
  const a = await ownerWithGroup(browser, "invP");
  await a.page.getByRole("button", { name: "Share", exact: true }).click();
  const dialog = a.page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Privacy notice")).toContainText("entire history");
  await expect(dialog.getByLabel("Privacy notice")).toContainText("Gemini");

  const create = dialog.getByRole("button", { name: "Create invite link" });
  await expect(create).toBeDisabled();
  const count = async () => (await admin.from("invitations").select("id", { count: "exact", head: true }).eq("group_id", a.groupId)).count;
  expect(await count()).toBe(0);

  await dialog.getByLabel("I understand and want to share this conversation.").check();
  await expect(create).toBeEnabled();
  expect(await count()).toBe(0); // still nothing until the button is used

  await a.page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(await count()).toBe(0);
  // Reopening starts from the notice again.
  await a.page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Create invite link" })).toBeDisabled();
  await a.context.close();
});

test("T3.3-3 a plain member does not get a Share button", async ({ browser }) => {
  const a = await ownerWithGroup(browser, "invO");
  const m = await signedInContext(browser, "invM");
  await admin.from("group_members").insert({ group_id: a.groupId, user_id: m.user.id, role: "member" });
  await m.page.goto(a.page.url());
  await expect(m.page.locator("#composer")).toBeVisible();
  await expect(m.page.getByRole("button", { name: "Share", exact: true })).toHaveCount(0);
  await a.context.close();
  await m.context.close();
});

test("T3.3-4 an invalid link shows a friendly message and no group details", async ({ browser }) => {
  const b = await signedInContext(browser, "invX");
  for (const path of [`/join/${generateInviteToken().token}`, "/join/garbage"]) {
    await b.page.goto(path);
    const box = b.page.getByTestId("join-invalid");
    await expect(box).toBeVisible({ timeout: 15_000 });
    await expect(box).toContainText("doesn’t work");
    await expect(b.page).toHaveURL(new RegExp(path.replace(/[/]/g, "\\/")));
  }
  await b.context.close();
});

test("T3.3-5 a revoked link stops working, and the owner can revoke from the dialog", async ({ browser }) => {
  const a = await ownerWithGroup(browser, "invR");
  const link = await createLinkViaUi(a.page);
  await expect(a.page.getByTestId("active-link")).toHaveCount(1);

  const b = await signedInContext(browser, "invRB");
  await a.page.getByRole("button", { name: /^Revoke link/ }).click();
  await expect(a.page.getByTestId("active-link")).toHaveCount(0);

  await b.page.goto(new URL(link).pathname);
  await expect(b.page.getByTestId("join-invalid")).toBeVisible({ timeout: 15_000 });
  const { data } = await admin.from("group_members").select("user_id").eq("group_id", a.groupId).eq("user_id", b.user.id);
  expect(data).toHaveLength(0);
  await a.context.close();
  await b.context.close();
});

test("T3.3-6 a full conversation tells the sixth person it is full", async ({ browser }) => {
  const a = await ownerWithGroup(browser, "invF");
  for (let i = 0; i < 4; i++) {
    const { data } = await admin.auth.admin.createUser({
      email: `hm-test-fill-${randomBytes(4).toString("hex")}@example.com`,
      email_confirm: true,
    });
    emails.push(data.user!.email!);
    await admin.from("group_members").insert({ group_id: a.groupId, user_id: data.user!.id, role: "member" });
  }
  const path = await storedInvite(a.groupId);
  const b = await signedInContext(browser, "invFB");
  await b.page.goto(path);
  await expect(b.page.getByTestId("join-full")).toBeVisible({ timeout: 15_000 });
  await expect(b.page.getByTestId("join-full")).toContainText("full");
  const { data } = await admin.from("group_members").select("user_id").eq("group_id", a.groupId);
  expect(data).toHaveLength(5);
  await a.context.close();
  await b.context.close();
});

test("T3.3-7 opening a link again when already a member just goes to the conversation", async ({ browser }) => {
  const a = await ownerWithGroup(browser, "invAM");
  const path = await storedInvite(a.groupId);
  const b = await signedInContext(browser, "invAMB");
  await b.page.goto(path);
  await b.page.waitForURL(new RegExp(`/groups/${a.groupId}$`), { timeout: 20_000 });
  await b.page.goto(path);
  await b.page.waitForURL(new RegExp(`/groups/${a.groupId}$`), { timeout: 20_000 });
  const { data } = await admin.from("group_members").select("user_id").eq("group_id", a.groupId).eq("user_id", b.user.id);
  expect(data).toHaveLength(1);
  // The owner opening their own link also lands in the conversation.
  await a.page.goto(path);
  await a.page.waitForURL(new RegExp(`/groups/${a.groupId}$`), { timeout: 20_000 });
  await a.context.close();
  await b.context.close();
});

test("an expired link shows the same friendly message", async ({ browser }) => {
  const a = await ownerWithGroup(browser, "invE");
  const path = await storedInvite(a.groupId, { expired: true });
  const b = await signedInContext(browser, "invEB");
  await b.page.goto(path);
  await expect(b.page.getByTestId("join-invalid")).toBeVisible({ timeout: 15_000 });
  await a.context.close();
  await b.context.close();
});

test("opening a link does not use it up until the page runs in a signed-in browser", async ({ browser }) => {
  const a = await ownerWithGroup(browser, "invS");
  const path = await storedInvite(a.groupId);
  // A scanner or preview bot only fetches the HTML: no session, no JavaScript.
  const res = await fetch(new URL(path, a.page.url()));
  expect(res.status).toBe(200);
  const { data } = await admin.from("group_members").select("user_id").eq("group_id", a.groupId);
  expect(data).toHaveLength(1); // still only the owner
  await a.context.close();
});
