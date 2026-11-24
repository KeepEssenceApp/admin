// Runs the portal on this machine: http://127.0.0.1:8821
//   - the fake core (dev/fake.mjs) on 8822, reached through the CORE_URL var
//   - a fresh local D1 for WAITLIST with the landing page's schema and a made-up list
//   - the Worker under `wrangler dev`, serving dist/ (run `npm run build` first)
// The values below are for this machine only (e2e/helpers.ts uses the same ones); a deployment
// has its own secrets.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { DEV_ADMIN_SECRET, startFake } from "./fake.mjs";

const PORT = 8821;
const FAKE_PORT = 8822;
const DEV_PASSWORD = "local-operator-password";

const wrangler = "node_modules/.bin/wrangler";
const env = { ...process.env, WRANGLER_SEND_METRICS: "false", NO_UPDATE_NOTIFIER: "1" };

if (!fs.existsSync("dist/index.html")) {
  console.error("dist/ is missing: run `npm run build` first.");
  process.exit(1);
}

// Start from a clean list every time, so a test run does not depend on the one before.
fs.rmSync(".wrangler/state", { recursive: true, force: true });
for (const file of ["dev/waitlist/0001_waitlist.sql", "dev/waitlist/seed.sql"]) {
  const done = spawnSync(wrangler, ["d1", "execute", "keepessence-waitlist", "--local", "--file", file], { env, encoding: "utf8" });
  if (done.status !== 0) {
    console.error(done.stdout, done.stderr);
    process.exit(1);
  }
}

await startFake(FAKE_PORT);

const child = spawn(
  wrangler,
  [
    "dev", "--port", String(PORT), "--ip", "127.0.0.1", "--local", "--show-interactive-dev-session=false",
    "--var", `ADMIN_PASSWORD:${DEV_PASSWORD}`,
    "--var", "SESSION_KEY:local-session-signing-key",
    "--var", `CORE_ADMIN_SECRET:${DEV_ADMIN_SECRET}`,
    "--var", `CORE_URL:http://127.0.0.1:${FAKE_PORT}`,
  ],
  { env, stdio: "inherit" },
);
const stop = () => child.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
