// Takes a picture of every page, for looking at. Needs the local portal running (`npm run dev`).
//   node dev/shots.mjs            → screenshots/*.png
import fs from "node:fs";
import { chromium, devices } from "@playwright/test";

const BASE = "http://127.0.0.1:8821";
const PASSWORD = "local-operator-password";
fs.mkdirSync("screenshots", { recursive: true });
await fetch("http://127.0.0.1:8822/__test/reset", { method: "POST" });

const browser = await chromium.launch();
const kinds = [
  { name: "desktop-light", use: { viewport: { width: 1280, height: 860 }, colorScheme: "light" } },
  { name: "desktop-dark", use: { viewport: { width: 1280, height: 860 }, colorScheme: "dark" } },
  { name: "phone-light", use: { ...devices["Pixel 7"], colorScheme: "light" } },
  { name: "phone-dark", use: { ...devices["Pixel 7"], colorScheme: "dark" } },
];

for (const kind of kinds) {
  const context = await browser.newContext({ ...kind.use, locale: process.env.SHOT_LOCALE ?? "zh-CN", timezoneId: "Asia/Shanghai" });
  const page = await context.newPage();
  const shot = (name, fullPage = true) => page.screenshot({ path: `screenshots/${kind.name}-${name}.png`, fullPage });
  const ready = async () => {
    await page.locator("main [aria-busy]").waitFor({ state: "detached" });
    await page.waitForTimeout(150);
  };

  await page.goto(BASE);
  await page.locator('input[name="password"]').waitFor();
  await shot("0-signin");
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.locator(".nav").waitFor();

  for (const [name, path] of [["1-overview", "/"], ["2-waitlist", "/waitlist"], ["3-invites", "/invites"], ["4-users", "/users"], ["5-user", "/users/usr_0001"], ["6-usage", "/usage"], ["7-audit", "/audit"]]) {
    await page.goto(BASE + path);
    await ready();
    await shot(name, !["3-invites", "4-users", "7-audit"].includes(name));
  }

  await page.goto(`${BASE}/invites`);
  await ready();
  await page.locator('tr[data-email="invited.lin@example.com"] button').first().click();
  await page.getByRole("dialog").waitFor();
  await shot("3b-code", false);

  await page.goto(`${BASE}/users/usr_0001`);
  await ready();
  await page.locator(".actions .btn.danger:not(.quiet)").click();
  await page.getByRole("dialog").waitFor();
  await page.locator('input[name="confirm_email"]').fill("reader@example");
  await shot("5b-delete", false);
  await page.keyboard.press("Escape");
  await page.locator(".actions .btn").first().click();
  await page.getByTestId("said").waitFor();
  await shot("5c-suspended", false);
  await page.locator(".actions .btn").first().click();

  if (kind.name.startsWith("phone")) {
    await page.goto(BASE);
    await ready();
    await page.locator(".nav-menu").click();
    await shot("8-menu", false);
  }
  await context.close();
}
await browser.close();
console.log(fs.readdirSync("screenshots").length, "pictures in screenshots/");
