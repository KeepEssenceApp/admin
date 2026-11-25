// Signing in, the session, and what is refused without one.
import { expect, test } from "@playwright/test";
import { ADMIN_SECRET, CHANGE, PASSWORD, auditEntries, lockedAddress, reset, signIn } from "./helpers";

test.beforeEach(async ({ request }) => reset(request));

const READS = ["/api/session", "/api/overview", "/api/waitlist", "/api/waitlist.csv", "/api/invites", "/api/users", "/api/users/usr_0001", "/api/usage?days=7", "/api/audit", "/api/feedback", "/api/nothing"];
const CHANGES: [string, string, unknown][] = [
  ["DELETE", "/api/session", undefined],
  ["POST", "/api/waitlist/invite", { emails: ["new.ada@example.com"] }],
  ["POST", "/api/invites", { text: "sneak@example.com" }],
  ["DELETE", "/api/invites", { email: "invited.lin@example.com" }],
  ["POST", "/api/login-codes", { email: "invited.lin@example.com" }],
  ["POST", "/api/users/usr_0001/suspend", undefined],
  ["POST", "/api/users/usr_0001/restore", undefined],
  ["POST", "/api/users/usr_0001/sign-out", undefined],
  ["DELETE", "/api/users/usr_0001/devices/dev_1_1", undefined],
  ["DELETE", "/api/users/usr_0001", { confirm_email: "reader@example.com" }],
];

test("signed-out requests to /api/ are refused, and change nothing", async ({ request }) => {
  for (const path of READS) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(401);
    expect((await res.json()).error.code).toBe("signed_out");
    expect(res.headers()["cache-control"]).toBe("no-store");
  }
  for (const [method, path, data] of CHANGES) {
    const res = await request.fetch(path, { method, data, headers: CHANGE });
    expect(res.status(), `${method} ${path}`).toBe(401);
  }
  // A made-up or changed cookie is no better than none.
  for (const value of ["v1.9999999999999.abc.def", "garbage", ""]) {
    const res = await request.get("/api/overview", { headers: { cookie: `ke_admin=${value}` } });
    expect(res.status()).toBe(401);
  }
});

test("the page and the API carry the private headers", async ({ request }) => {
  const page = await request.get("/");
  expect(page.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  const csp = page.headers()["content-security-policy"];
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain("unsafe-inline");
  expect(await page.text()).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
  // Any path that is not a file is the app, with the same headers.
  const deep = await request.get("/users/usr_0001");
  expect(deep.headers()["content-security-policy"]).toBe(csp);
  expect(deep.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  const api = await request.get("/api/session");
  expect(api.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  expect(api.headers()["cache-control"]).toBe("no-store");
});

test("the sign-in page is dark and has one field", async ({ page }) => {
  await page.goto("/users");
  await expect(page.locator('input[name="password"]')).toBeVisible();
  await expect(page.locator("input")).toHaveCount(1);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".front")).toHaveCSS("background-color", "rgb(11, 11, 11)");
  await expect(page.getByRole("heading", { name: "管理后台" })).toBeVisible();
});

test("a wrong password is refused with a sentence; the right one opens the portal", async ({ page, context }) => {
  await page.goto("/");
  await page.locator('input[name="password"]').fill("not the password");
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole("alert")).toHaveText("口令不对。");
  await expect(page.locator(".nav")).toHaveCount(0);
  expect((await context.cookies()).filter((c) => c.name === "ke_admin")).toEqual([]);

  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole("heading", { level: 1, name: "概览" })).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "dark");

  const [cookie] = (await context.cookies()).filter((c) => c.name === "ke_admin");
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Strict", path: "/" });
  // 12 hours, give or take the time this test took.
  const hours = (cookie.expires * 1000 - Date.now()) / 3_600_000;
  expect(hours).toBeGreaterThan(11.9);
  expect(hours).toBeLessThanOrEqual(12);
  // The page itself cannot read it.
  expect(await page.evaluate(() => document.cookie)).not.toContain("ke_admin");

  expect((await auditEntries(page))[0]).toMatchObject({ action: "portal.sign_in", source: "portal" });
});

test("a signed-in request that changes something still needs the x-ke-admin header", async ({ page }) => {
  await signIn(page);
  for (const [method, path, data] of CHANGES.filter(([, p]) => p !== "/api/session")) {
    const res = await page.request.fetch(path, { method, data });
    expect(res.status(), `${method} ${path}`).toBe(403);
    expect((await res.json()).error.code).toBe("header_required");
  }
  // Nothing happened: the account is still there and still active.
  const user = await (await page.request.get("/api/users/usr_0001")).json();
  expect(user).toMatchObject({ email: "reader@example.com", status: "active" });
  expect(user.devices).toHaveLength(3);
  // Signing in itself needs the header too.
  expect((await page.request.post("/api/session", { data: { password: PASSWORD } })).status()).toBe(403);
});

test("a session whose signature or expiry was changed is refused", async ({ page, context }) => {
  await signIn(page);
  const [cookie] = (await context.cookies()).filter((c) => c.name === "ke_admin");
  const [v, expires, random, mac] = cookie.value.split(".");
  const anon = await page.context().browser()!.newContext();
  for (const value of [[v, String(Number(expires) + 86_400_000), random, mac].join("."), [v, expires, random, mac.slice(0, -2) + "AA"].join("."), [v, expires, random].join(".")]) {
    expect((await anon.request.get("/api/overview", { headers: { cookie: `ke_admin=${value}` } })).status()).toBe(401);
  }
  // The untouched value works from anywhere until it expires.
  expect((await anon.request.get("/api/overview", { headers: { cookie: `ke_admin=${cookie.value}` } })).status()).toBe(200);
  await anon.close();
});

test("five wrong passwords lock the address out for a while, even for the right password", async ({ browser, page }, info) => {
  const address = lockedAddress(info);
  const context = await browser.newContext({ ...info.project.use, extraHTTPHeaders: { "cf-connecting-ip": address } });
  const locked = await context.newPage();
  await locked.goto("/");
  for (let n = 1; n <= 5; n++) {
    await locked.locator('input[name="password"]').fill(`wrong ${n}`);
    await locked.locator('button[type="submit"]').click();
    await expect(locked.getByRole("alert")).toHaveText("口令不对。");
    await expect(locked.locator('input[name="password"]')).toHaveValue("");
  }
  await locked.locator('input[name="password"]').fill("wrong 6");
  await locked.locator('button[type="submit"]').click();
  await expect(locked.getByRole("alert")).toHaveText("输错太多次了，10 分钟后再试。");

  await locked.locator('input[name="password"]').fill(PASSWORD);
  await locked.locator('button[type="submit"]').click();
  await expect(locked.getByRole("alert")).toHaveText("输错太多次了，10 分钟后再试。");
  await expect(locked.locator(".nav")).toHaveCount(0);
  const res = await context.request.post("/api/session", { data: { password: PASSWORD }, headers: CHANGE });
  expect(res.status()).toBe(429);
  expect(res.headers()["retry-after"]).toBe("600");
  expect((await context.cookies()).filter((c) => c.name === "ke_admin")).toEqual([]);
  await context.close();

  // Another address is not affected, and the lockout is in the audit log, without the address.
  await signIn(page);
  const lockout = (await auditEntries(page)).find((e) => e.action === "portal.lockout");
  expect(lockout).toMatchObject({ source: "portal", target: "operator" });
  expect(lockout!.detail).not.toContain(address);
  await page.goto("/audit");
  await expect(page.locator('tr[data-action="portal.lockout"]').first()).toContainText("口令连续输错");
});

test("signing out ends the session", async ({ page, context }, info) => {
  await signIn(page);
  if (info.project.name === "phone") await page.getByRole("button", { name: "菜单" }).click();
  await page.locator('[data-entry="signout"]').click();
  await expect(page.locator('input[name="password"]')).toBeVisible();
  expect((await context.cookies()).filter((c) => c.name === "ke_admin")).toEqual([]);
  expect((await page.request.get("/api/overview")).status()).toBe(401);
  await page.goto("/waitlist");
  await expect(page.locator('input[name="password"]')).toBeVisible();
});

test("the operator secret and the password are in no response and in no built file", async ({ page }) => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const bodies: string[] = [];
  page.on("response", async (res) => {
    try {
      bodies.push(`${res.url()}\n${JSON.stringify(await res.allHeaders())}\n${await res.text()}`);
    } catch {
      /* a redirect or an aborted request has no body */
    }
  });
  await signIn(page);
  for (const to of ["/", "/waitlist", "/invites", "/users", "/users/usr_0001", "/usage", "/audit"]) {
    await page.goto(to);
    await expect(page.locator("main [aria-busy]")).toHaveCount(0);
    await expect(page.locator("main table").first()).toBeVisible();
  }
  for (const path of ["/api/waitlist.csv", "/api/nothing", "/api/users/usr_missing", "/api/usage?days=500"]) {
    const res = await page.request.get(path);
    bodies.push(`${path}\n${JSON.stringify(res.headers())}\n${await res.text()}`);
  }
  expect(bodies.length).toBeGreaterThan(15);
  for (const body of bodies) {
    expect(body.includes(ADMIN_SECRET), body.slice(0, 80)).toBe(false);
    expect(body.includes(PASSWORD), body.slice(0, 80)).toBe(false);
    expect(/authorization|bearer /i.test(body), body.slice(0, 80)).toBe(false);
  }

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) e.isDirectory() ? walk(path.join(dir, e.name)) : files.push(path.join(dir, e.name));
  };
  walk("dist");
  expect(files.length).toBeGreaterThan(2);
  for (const file of files) {
    const text = fs.readFileSync(file, "latin1");
    for (const word of [ADMIN_SECRET, PASSWORD, "CORE_ADMIN_SECRET", "ADMIN_PASSWORD", "SESSION_KEY", "Bearer ", "/admin/"]) expect(text.includes(word), `${file}: ${word}`).toBe(false);
  }
});
