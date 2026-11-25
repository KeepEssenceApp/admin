// An in-memory stand-in for the core's operator interface, exactly as in the core's
// docs/admin-api.md. For development and tests only: every person and number here is made up.
//
//   node dev/fake.mjs            listens on 127.0.0.1:8822 (FAKE_PORT)
//
// Besides /admin/… it has two hooks for the tests, without a secret:
//   POST /__test/reset           back to the seed
//   POST /__test/state           { mail_configured?, minute_ago_s?, hourly_ago_s? }
import http from "node:http";
import { pathToFileURL } from "node:url";

export const DEV_ADMIN_SECRET = process.env.CORE_ADMIN_SECRET ?? "local-core-operator-secret";

const DAY = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();
const dayOf = (ms) => iso(ms).slice(0, 10);
const isEmail = (v) => typeof v === "string" && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// A small repeatable generator, so the seed is the same on every start.
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Emails on the invitation list that have not joined; some of them are on the seeded waitlist. */
const PENDING = ["invited.lin@example.com", "invited.omar@example.com", "pending.kai@example.com", "pending.ines@example.com"];

function seed() {
  const now = Date.now();
  const rand = rng(20261125);
  const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const users = [];
  for (let n = 1; n <= 64; n++) {
    const id = `usr_${String(n).padStart(4, "0")}`;
    const created = now - n * 9 * 3_600_000 - int(0, 3_000_000);
    const suspended = n === 7 || n === 23;
    const quiet = n % 9 === 0;
    const devices = Array.from({ length: n === 1 ? 3 : int(1, 2) }, (_, i) => ({
      id: `dev_${n}_${i + 1}`,
      name: ["MacBook Chrome", "Pixel 9", "iPhone 16", "Work laptop"][(n + i) % 4],
      client: ["web", "android", "ios", "extension"][(n + i) % 4],
      tier: i === 0 ? "manage" : ["read", "save"][(n + i) % 2],
      created_at: iso(created + i * 3_600_000),
      last_used_at: quiet ? null : iso(now - int(1, 6 * 24) * 3_600_000),
      notifications: i === 0 && n % 2 === 0,
    }));
    const assistants = [
      { id: `ast_${n}_1`, name: "Built-in analyst", kind: "scheduled", built_in: true, steps: ["triage", "analysis", "digest"], connected_at: iso(created), last_seen_at: iso(now - int(1, 50) * 60_000) },
      ...(n % 3 === 0 ? [{ id: `ast_${n}_2`, name: "Claude", kind: "chat", built_in: false, steps: ["deep_read"], connected_at: iso(created + DAY), last_seen_at: n % 6 === 0 ? null : iso(now - int(2, 90) * 3_600_000) }] : []),
    ];
    const days = Array.from({ length: 30 }, (_, i) => {
      const saved = quiet ? 0 : int(0, 9);
      return { day: dayOf(now - i * DAY), saved, analysed: Math.max(0, saved - int(0, 2)), digests: saved ? 1 : 0, notes: int(0, 1) };
    });
    const calls = quiet ? 0 : int(20, 400);
    const usage = [
      { assistant_id: `ast_${n}_1`, name: "Built-in analyst", built_in: true, calls, input_tokens: calls * int(900, 2400), output_tokens: calls * int(120, 400), items: Math.round(calls / 2) },
      { assistant_id: `ast_${n}_0`, name: "Dispatch", built_in: true, calls: Math.round(calls / 3), input_tokens: calls * 210, output_tokens: calls * 18, items: Math.round(calls / 3) },
    ];
    users.push({
      id,
      email: n === 1 ? "reader@example.com" : n === 2 ? "joined.mei@example.com" : n === 3 ? "joined.sam@example.com" : `person${String(n).padStart(2, "0")}@example.com`,
      created_at: iso(created),
      last_active_at: quiet ? null : devices.map((d) => d.last_used_at).sort().at(-1),
      status: suspended ? "suspended" : "active",
      lang: n % 2 ? "zh" : "en",
      timezone: n % 2 ? "Asia/Shanghai" : "Europe/London",
      items_live: int(0, 260),
      notes: int(0, 40),
      storage_bytes: n === 1 ? 734_003_200 : int(0, 90_000_000),
      suspended_at: suspended ? iso(now - 3 * DAY) : null,
      devices,
      assistants,
      days,
      usage,
    });
  }
  const invites = [
    ...PENDING.map((email, i) => ({ email, invited_at: iso(now - (i + 1) * 2 * 3_600_000) })),
    ...users.map((u) => ({ email: u.email, invited_at: iso(new Date(u.created_at).getTime() - 6 * 3_600_000) })),
  ];
  const audit = [];
  const actions = ["invite.add", "login_code.mint", "user.sign_out", "portal.sign_in", "user.device_revoke"];
  for (let n = 70; n >= 1; n--) {
    const action = actions[n % actions.length];
    audit.push({
      id: `aud_${String(71 - n).padStart(5, "0")}`,
      at: iso(now - n * 7 * 3_600_000),
      action,
      target: action.startsWith("portal.") ? "operator" : `person${String((n % 60) + 4).padStart(2, "0")}@example.com`,
      detail: action === "user.sign_out" ? "revoked 2 devices" : "",
      source: action.startsWith("portal.") ? "portal" : "core",
    });
  }
  return { users, invites, audit, codes: new Map(), auditSeq: 71, mail_configured: false, minute_ago_s: 95, hourly_ago_s: 1500 };
}

let db = seed();

const row = (u) => ({
  id: u.id, email: u.email, created_at: u.created_at, last_active_at: u.last_active_at, status: u.status, lang: u.lang, timezone: u.timezone,
  devices: u.devices.length, assistants: u.assistants.length, items_live: u.items_live, notes: u.notes, storage_bytes: u.storage_bytes,
});
const detail = (u) => ({ ...row(u), suspended_at: u.suspended_at, devices: u.devices, assistants: u.assistants, days: u.days, usage: u.usage });
const log = (action, target, detailText = "", source = "core") =>
  db.audit.push({ id: `aud_${String(db.auditSeq++).padStart(5, "0")}`, at: iso(Date.now()), action, target, detail: detailText, source });
const sum = (list, key) => list.reduce((n, x) => n + x[key], 0);

function page(list, url, key) {
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const start = Math.max(0, Number(Buffer.from(url.searchParams.get("cursor") ?? "", "base64url").toString() || 0) || 0);
  const slice = list.slice(start, start + limit);
  return { [key]: slice, next_cursor: start + limit < list.length ? Buffer.from(String(start + limit)).toString("base64url") : null };
}

/** Per-day totals of the built-in assistants over all users. */
function usageDays(days) {
  const now = Date.now();
  const rand = rng(77);
  return Array.from({ length: days }, (_, i) => {
    const calls = 300 + Math.floor(rand() * 900);
    return { day: dayOf(now - i * DAY), calls, input_tokens: calls * (1500 + Math.floor(rand() * 600)), output_tokens: calls * (200 + Math.floor(rand() * 90)), items: Math.round(calls / 2.2) };
  });
}

function overview() {
  const now = Date.now();
  const week = usageDays(7);
  const total = (list) => ({ calls: sum(list, "calls"), input_tokens: sum(list, "input_tokens"), output_tokens: sum(list, "output_tokens") });
  const joined = new Set(db.users.map((u) => u.email));
  return {
    users: {
      total: db.users.length,
      active_7d: db.users.filter((u) => u.last_active_at && now - new Date(u.last_active_at).getTime() < 7 * DAY).length,
      suspended: db.users.filter((u) => u.status === "suspended").length,
    },
    invites: { total: db.invites.length, pending: db.invites.filter((i) => !joined.has(i.email)).length },
    items: { today: sum(db.users, "items_live") % 97, last_7d: 412, live: sum(db.users, "items_live") },
    analyses: { today: 61, last_7d: 388 },
    digests: { last_7d: 173 },
    notes: { total: sum(db.users, "notes") },
    waiting: { triage: 4, analysis: 11 },
    usage: { today: total(week.slice(0, 1)), last_7d: total(week) },
    cron: {
      minute_ran_at: db.minute_ago_s === null ? null : iso(now - db.minute_ago_s * 1000),
      hourly_ran_at: db.hourly_ago_s === null ? null : iso(now - db.hourly_ago_s * 1000),
    },
    config: { model: "claude-haiku-5-5", model_configured: true, mail_configured: db.mail_configured, push_configured: true, version: "1.4.2-fake" },
  };
}

function send(res, status, body) {
  if (body === undefined) return res.writeHead(status).end();
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(body));
}
const fail = (res, status, code, message) => send(res, status, { error: { code, message } });

async function body(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function sameSecret(header) {
  const want = Buffer.from("Bearer " + DEV_ADMIN_SECRET);
  const got = Buffer.from(header ?? "");
  return got.length === want.length && Buffer.compare(got, want) === 0;
}

export async function handle(req, res) {
  const url = new URL(req.url, "http://fake.invalid");
  const path = url.pathname;
  const method = req.method;

  if (path === "/__test/reset" && method === "POST") {
    db = seed();
    return send(res, 200, { ok: true });
  }
  if (path === "/__test/state" && method === "POST") {
    const b = await body(req);
    for (const key of ["mail_configured", "minute_ago_s", "hourly_ago_s"]) if (key in b) db[key] = b[key];
    return send(res, 200, { ok: true });
  }
  if (!path.startsWith("/admin/")) return fail(res, 404, "not_found", "Not found.");
  if (!sameSecret(req.headers.authorization)) return fail(res, 401, "unauthorized", "The operator secret is missing or wrong.");

  if (path === "/admin/overview" && method === "GET") return send(res, 200, overview());

  if (path === "/admin/invites") {
    if (method === "GET") {
      const byEmail = new Map(db.users.map((u) => [u.email, u]));
      const invites = db.invites
        .map((i) => ({ email: i.email, invited_at: i.invited_at, joined_at: byEmail.get(i.email)?.created_at ?? null, user_id: byEmail.get(i.email)?.id ?? null }))
        .sort((a, b) => b.invited_at.localeCompare(a.invited_at));
      return send(res, 200, { invites });
    }
    const b = await body(req);
    if (method === "POST") {
      const given = Array.isArray(b.emails) ? b.emails : [b.email];
      const out = { added: [], already: [], invalid: [] };
      for (const raw of given) {
        const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
        if (!isEmail(email)) out.invalid.push(String(raw ?? ""));
        else if (db.invites.some((i) => i.email === email)) out.already.push(email);
        else {
          db.invites.push({ email, invited_at: iso(Date.now()) });
          out.added.push(email);
          log("invite.add", email);
        }
      }
      return send(res, 201, out);
    }
    if (method === "DELETE") {
      const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
      if (db.invites.some((i) => i.email === email)) log("invite.remove", email);
      db.invites = db.invites.filter((i) => i.email !== email);
      return send(res, 204);
    }
  }

  if (path === "/admin/login-codes" && method === "POST") {
    const b = await body(req);
    const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    if (!db.invites.some((i) => i.email === email)) return fail(res, 404, "not_invited", "This email is not on the invitation list.");
    if (db.users.some((u) => u.email === email && u.status === "suspended")) return fail(res, 409, "suspended", "This account is suspended.");
    const code = String(100000 + Math.floor(Math.random() * 900000));
    const expires_at = iso(Date.now() + 10 * 60_000);
    db.codes.set(email, { code, expires_at });
    log("login_code.mint", email);
    return send(res, 200, { code, expires_at });
  }

  if (path === "/admin/users" && method === "GET") {
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const status = url.searchParams.get("status");
    const list = db.users
      .filter((u) => (!q || u.email.includes(q)) && (!status || u.status === status))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(row);
    return send(res, 200, page(list, url, "users"));
  }

  const m = path.match(/^\/admin\/users\/([^/]+)(?:\/(suspend|restore|sign-out)|\/devices\/([^/]+))?$/);
  if (m) {
    const user = db.users.find((u) => u.id === decodeURIComponent(m[1]));
    if (!user) return fail(res, 404, "not_found", "No such user.");
    if (!m[2] && !m[3]) {
      if (method === "GET") return send(res, 200, detail(user));
      if (method === "DELETE") {
        const b = await body(req);
        if (typeof b.confirm_email !== "string" || b.confirm_email.trim().toLowerCase() !== user.email) return fail(res, 400, "confirm_mismatch", "The email does not match.");
        db.users = db.users.filter((u) => u !== user);
        db.invites = db.invites.filter((i) => i.email !== user.email);
        log("user.delete", user.email);
        return send(res, 204);
      }
    }
    if (m[2] && method === "POST") {
      if (m[2] === "suspend") {
        user.status = "suspended";
        user.suspended_at = iso(Date.now());
        log("user.suspend", user.email);
        return send(res, 200, row(user));
      }
      if (m[2] === "restore") {
        user.status = "active";
        user.suspended_at = null;
        log("user.restore", user.email);
        return send(res, 200, row(user));
      }
      const revoked = user.devices.length;
      user.devices = [];
      log("user.sign_out", user.email, `revoked ${revoked} devices`);
      return send(res, 200, { revoked });
    }
    if (m[3] && method === "DELETE") {
      const id = decodeURIComponent(m[3]);
      if (!user.devices.some((d) => d.id === id)) return fail(res, 404, "not_found", "No such device.");
      user.devices = user.devices.filter((d) => d.id !== id);
      log("user.device_revoke", user.email, id);
      return send(res, 204);
    }
  }

  if (path === "/admin/usage" && method === "GET") {
    const days = Number(url.searchParams.get("days") ?? 30);
    if (!Number.isInteger(days) || days < 1 || days > 90) return fail(res, 400, "bad_request", "days is 1 to 90.");
    const top_users = db.users
      .map((u) => ({ user_id: u.id, email: u.email, calls: sum(u.usage, "calls"), input_tokens: sum(u.usage, "input_tokens"), output_tokens: sum(u.usage, "output_tokens") }))
      .sort((a, b) => b.input_tokens + b.output_tokens - (a.input_tokens + a.output_tokens))
      .slice(0, 20);
    return send(res, 200, { days: usageDays(days), top_users });
  }

  if (path === "/admin/feedback" && method === "GET") {
    const list = [
      { id: "fb_0002", at: iso(Date.now() - 3600e3), user_id: "usr_0001", email: db.users[0]?.email ?? "ann@example.com", client: "web", where: "web", doing: "刚登录进来。", wrong: "不知道从哪里开始。\n第二行。", wish: "给一个指引。", issue_url: null, forward_error: null },
      { id: "fb_0001", at: iso(Date.now() - 7200e3), user_id: "usr_0002", email: db.users[1]?.email ?? "bo@example.com", client: "web", where: "android", doing: "", wrong: "分享菜单里找不到。", wish: "", issue_url: "https://github.com/example/feedback/issues/1", forward_error: null },
    ];
    return send(res, 200, { forwarding: null, ...page(list, url, "feedback") });
  }
  if (path === "/admin/audit") {
    if (method === "GET") return send(res, 200, page([...db.audit].reverse(), url, "entries"));
    if (method === "POST") {
      const b = await body(req);
      if (typeof b.action !== "string" || !b.action) return fail(res, 400, "bad_request", "action is needed.");
      log(b.action, String(b.target ?? ""), String(b.detail ?? ""), "portal");
      return send(res, 201, db.audit.at(-1));
    }
  }

  return fail(res, 404, "not_found", "Not found.");
}

export function startFake(port = Number(process.env.FAKE_PORT ?? 8822)) {
  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) fail(res, 500, "failed", "The fake failed.");
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const port = Number(process.env.FAKE_PORT ?? 8822);
  await startFake(port);
  console.log(`fake core admin interface on http://127.0.0.1:${port}/admin/`);
}
