import { expect, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";

// The made-up values dev/start.mjs and dev/fake.mjs run with. A deployment has its own.
export const PASSWORD = "local-operator-password";
export const ADMIN_SECRET = "local-core-operator-secret";
export const SESSION_KEY = "local-session-signing-key";
export const FAKE = "http://127.0.0.1:8822";
/** What a request that changes something must carry. */
export const CHANGE = { "x-ke-admin": "1" };

/** Puts the fake core back to its seed. The sign-up list keeps its rows; their status follows the core. */
export async function reset(request: APIRequestContext, state: Record<string, unknown> = {}) {
  expect((await request.post(`${FAKE}/__test/reset`)).ok()).toBe(true);
  if (Object.keys(state).length) await setFake(request, state);
}
export async function setFake(request: APIRequestContext, state: Record<string, unknown>) {
  expect((await request.post(`${FAKE}/__test/state`, { data: state })).ok()).toBe(true);
}

export async function signIn(page: Page, path = "/", password = PASSWORD) {
  await page.goto(path);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page.locator(".nav")).toBeVisible();
}

export const isPhone = (info: TestInfo) => info.project.name === "phone";
/** An address of its own for each project, so one project's lockout does not lock the other. */
export const lockedAddress = (info: TestInfo) => (isPhone(info) ? "203.0.113.12" : "203.0.113.11");

export const said = (page: Page) => page.getByTestId("said");
export const row = (page: Page, email: string) => page.locator(`tr[data-email="${email}"]`);

/** The audit log as the portal's API returns it, newest first. */
export async function auditEntries(page: Page, limit = 30): Promise<{ action: string; target: string; detail: string; source: string }[]> {
  const res = await page.request.get(`/api/audit?limit=${limit}`);
  expect(res.ok()).toBe(true);
  return (await res.json()).entries;
}
