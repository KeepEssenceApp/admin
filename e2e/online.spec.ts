// A deployed portal: sign in and see that every page loads real data. It changes nothing:
// no invitation, no code, no account action. The only trace is the sign-in itself (and the
// sign-out) in the audit log.
//
//   KE_ADMIN_URL=https://admin.keepessence.app KE_ADMIN_PASSWORD=… npm run e2e
import { expect, test, type Page } from "@playwright/test";

const url = process.env.KE_ADMIN_URL;
const password = process.env.KE_ADMIN_PASSWORD;

test.describe("a deployed portal", () => {
  test.skip(!url || !password, "set KE_ADMIN_URL and KE_ADMIN_PASSWORD");

  async function signIn(page: Page, path = "/") {
    await page.goto(path);
    await page.locator('input[name="password"]').fill(password!);
    await page.locator('button[type="submit"]').click();
    await expect(page.locator(".nav")).toBeVisible();
  }
  const loaded = async (page: Page) => {
    await expect(page.locator("main [aria-busy]")).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
  };

  test("refuses a request without a session, and is not indexed", async ({ request }) => {
    for (const path of ["/api/overview", "/api/waitlist", "/api/users", "/api/audit"]) expect((await request.get(path)).status(), path).toBe(401);
    const page = await request.get("/");
    expect(page.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    expect(page.headers()["content-security-policy"]).toContain("script-src 'self'");
  });

  test("every page loads real data", async ({ page }) => {
    // No page asks for anything but the portal's own origin.
    const origin = new URL(url!).origin;
    const foreign: string[] = [];
    page.on("request", (req) => {
      if (!req.url().startsWith(origin)) foreign.push(req.url());
    });
    await signIn(page);

    // Overview: numbers from the core and the sign-up list, and a minute job that is running.
    await loaded(page);
    await expect(page.getByTestId("waitlist-counts").locator(".stat")).toHaveCount(3);
    await expect(page.getByTestId("account-counts").locator(".stat-value").first()).toHaveText(/^[\d,]+$/);
    await expect(page.getByTestId("cron-minute").locator(".state")).toHaveAttribute("data-dot", "solid");
    await expect(page.getByTestId("config").locator('[data-config="version"] dd')).not.toBeEmpty();
    const overview = await (await page.request.get("/api/overview")).json();
    expect(overview.core.users.total).toBeGreaterThan(0);
    expect(overview.waitlist.signups).toBeGreaterThanOrEqual(overview.waitlist.joined);

    await page.goto("/waitlist");
    await loaded(page);
    await expect(page.getByTestId("waitlist-summary")).toBeVisible();
    const waitlist = await (await page.request.get("/api/waitlist")).json();
    if (waitlist.rows.length) await expect(page.locator("main tbody tr")).toHaveCount(waitlist.rows.length);
    const csv = await page.request.get("/api/waitlist.csv");
    expect(csv.status()).toBe(200);
    expect((await csv.text()).charCodeAt(0)).toBe(0xfeff);

    await page.goto("/invites");
    await loaded(page);
    const invites = await (await page.request.get("/api/invites")).json();
    expect(invites.invites.length).toBeGreaterThan(0);
    await expect(page.locator("main tbody tr")).toHaveCount(invites.invites.length);
    await expect(page.getByTestId("mail-note")).toBeVisible();

    await page.goto("/users");
    await loaded(page);
    const first = page.locator("main tbody tr").first();
    await expect(first).toBeVisible();
    await first.getByRole("link").click();
    await loaded(page);
    await expect(page.getByTestId("user-email")).toContainText("@");
    await expect(page.getByTestId("user-days").locator("tr").first()).toBeVisible();

    await page.goto("/usage");
    await loaded(page);
    await expect(page.locator(".segments button")).toHaveCount(3);
    expect((await (await page.request.get("/api/usage?days=7")).json()).days.length).toBeLessThanOrEqual(7);

    // The audit log: this sign-in is at or near the top.
    await page.goto("/audit");
    await loaded(page);
    await expect(page.locator('tr[data-action="portal.sign_in"]').first()).toBeVisible();

    expect(foreign).toEqual([]);
    await page.request.delete("/api/session", { headers: { "x-ke-admin": "1" } });
    expect((await page.request.get("/api/overview")).status()).toBe(401);
  });
});
