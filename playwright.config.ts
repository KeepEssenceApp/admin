import { defineConfig, devices } from "@playwright/test";

// Without KE_ADMIN_URL the tests build the app and run the Worker on this machine
// (dev/start.mjs: wrangler dev on 8821, the fake core on 8822, a fresh local sign-up list).
// With KE_ADMIN_URL (and KE_ADMIN_PASSWORD) only e2e/online.spec.ts runs, against that
// deployed portal, and it changes nothing there.
const online = process.env.KE_ADMIN_URL;
const baseURL = online ?? "http://127.0.0.1:8821";

export default defineConfig({
  testDir: "e2e",
  testMatch: online ? "online.spec.ts" : "*.spec.ts",
  // One backend with one state: tests take turns.
  workers: 1,
  fullyParallel: false,
  timeout: online ? 60000 : 30000,
  expect: { timeout: online ? 15000 : 7000 },
  reporter: [["list"]],
  use: { baseURL, locale: "zh-CN", timezoneId: "Asia/Shanghai", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  // Always a fresh server: it starts from the seeded list, so a run does not depend on the last one.
  webServer: online ? undefined : { command: "npm run build && node dev/start.mjs", url: baseURL, reuseExistingServer: false, timeout: 120000 },
});
