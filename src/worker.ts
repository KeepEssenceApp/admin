// The portal's server. It serves the static app and a small API under /api/ for it.
//
// The browser only ever talks to this Worker. After checking the operator's session the Worker
// calls the core's operator interface (/admin/…, see the core's docs/admin-api.md) with
// CORE_ADMIN_SECRET, or reads the landing page's sign-up database. The secret never leaves here.
//
//   POST   /api/session            { password } → 204 + cookie; 401 wrong; 429 too many failures
//   GET    /api/session            → { expires_at }
//   DELETE /api/session            → 204, cookie cleared
//   GET    /api/overview           → { core: <GET /admin/overview>, waitlist: { signups, invited, joined } }
//   GET    /api/waitlist           → { rows: [sign-up + status] }
//   GET    /api/waitlist.csv       → the list as a spreadsheet file
//   POST   /api/waitlist/invite    { emails } → { added, already, invalid }
//   GET    /api/invites            → { invites, mail_configured }
//   POST   /api/invites            { text } → { added, already, invalid }
//   DELETE /api/invites            { email } → 204
//   POST   /api/login-codes        { email } → { code, expires_at }
//   GET    /api/users, /api/users/{id}, /api/usage, /api/audit                    passed to the core
//   POST   /api/users/{id}/suspend | restore | sign-out                            passed to the core
//   DELETE /api/users/{id}/devices/{device_id}, DELETE /api/users/{id}             passed to the core
//
// Every route except POST /api/session needs a valid session; every route that is not a GET also
// needs the header `x-ke-admin: 1`, which a form on another site cannot send.

import { waitlistCsv } from "./shared/csv";
import { isEmail, parseEmails } from "./shared/emails";
import { COOKIE, SESSION_TTL_MS, clearedCookie, readCookie, sameText, sessionCookie, sha256Hex, signSession, verifySession } from "./shared/session";
import { joinStatus, waitlistCounts, type Invite, type Signup } from "./shared/waitlist";

interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<unknown>;
}
interface Fetcher {
  fetch(request: Request): Promise<Response>;
}
export interface Env {
  ASSETS: Fetcher;
  CORE?: Fetcher;
  WAITLIST?: Database;
  ADMIN_PASSWORD?: string;
  SESSION_KEY?: string;
  CORE_ADMIN_SECRET?: string;
  /** Local development only: fetched instead of the CORE binding. */
  CORE_URL?: string;
}

const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 10 * 60 * 1000;
const MAX_BODY_BYTES = 256 * 1024;
/** The host is only a label: the request goes through the service binding, not the network. */
const CORE_ORIGIN = "https://keepessence.app";

const PRIVATE = {
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};
const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; " +
  "base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...PRIVATE, "content-type": "application/json; charset=utf-8", ...headers } });
const empty = (headers: Record<string, string> = {}) => new Response(null, { status: 204, headers: { ...PRIVATE, ...headers } });
const fail = (status: number, code: string, message: string, headers: Record<string, string> = {}) =>
  json(status, { error: { code, message } }, headers);

class Refused extends Error {
  constructor(readonly response: Response) {
    super("refused");
  }
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) throw new Refused(fail(413, "too_large", "The request is too large."));
  if (!raw) return {};
  try {
    const body = JSON.parse(raw);
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    /* falls through */
  }
  throw new Refused(fail(400, "bad_request", "Expected a JSON object."));
}

// ------------------------------------------------------------------------------------- the core

/** Calls the core's operator interface. `path` starts with /admin/. */
async function core(env: Env, method: string, path: string, body?: unknown): Promise<Response> {
  if (!env.CORE_ADMIN_SECRET) throw new Refused(fail(503, "not_set_up", "The CORE_ADMIN_SECRET secret is missing."));
  const init: RequestInit = {
    method,
    headers: { authorization: "Bearer " + env.CORE_ADMIN_SECRET, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
  try {
    if (env.CORE_URL) return await fetch(env.CORE_URL.replace(/\/$/, "") + path, init);
    if (!env.CORE) throw new Error("no CORE binding");
    return await env.CORE.fetch(new Request(CORE_ORIGIN + path, init));
  } catch (err) {
    console.error("core unreachable", err instanceof Error ? err.message : err);
    throw new Refused(fail(502, "core_unreachable", "The core did not answer."));
  }
}

/** The core's JSON answer, or a Refused carrying the core's own error. */
async function coreJson<T>(env: Env, method: string, path: string, body?: unknown): Promise<T> {
  const res = await core(env, method, path, body);
  if (!res.ok) throw new Refused(await relay(res));
  return (await res.json()) as T;
}

/** Hands the core's answer to the browser: status and JSON body, with the portal's own headers. */
async function relay(res: Response): Promise<Response> {
  if (res.status === 204) return empty();
  const text = await res.text();
  try {
    return json(res.status, JSON.parse(text));
  } catch {
    // Not JSON (the core answers 404 with a page when ADMIN_SECRET is not set there).
    return fail(res.ok ? 502 : res.status, "core_error", `The core answered ${res.status}.`);
  }
}

/** A line in the core's audit log for something the portal did itself. Never stops the action. */
async function audit(env: Env, action: string, target: string, detail = ""): Promise<void> {
  try {
    const res = await core(env, "POST", "/admin/audit", { action, target, detail });
    if (!res.ok) console.error("audit entry refused", res.status);
  } catch {
    /* the action already happened; the log line is lost */
  }
}

// ------------------------------------------------------------------------------------- sign-in

const addressKey = async (request: Request) =>
  // Prefixed, so it can never be the same value as one of the landing page's own rows.
  "admin:" + (await sha256Hex(request.headers.get("cf-connecting-ip") || "unknown"));

async function signIn(request: Request, env: Env): Promise<Response> {
  if (!env.ADMIN_PASSWORD || !env.SESSION_KEY) return fail(503, "not_set_up", "The ADMIN_PASSWORD or SESSION_KEY secret is missing.");
  if (!env.WAITLIST) return fail(503, "not_set_up", "The sign-up database is not attached.");
  const body = await readJson(request);
  const given = typeof body.password === "string" ? body.password : "";

  const key = await addressKey(request);
  const now = Date.now();
  const since = new Date(now - FAILURE_WINDOW_MS).toISOString();
  const recent = await env.WAITLIST.prepare("SELECT COUNT(*) AS n FROM attempts WHERE ip_hash = ?1 AND at > ?2").bind(key, since).first<{ n: number }>();
  const locked = () => fail(429, "too_many_attempts", "Too many wrong passwords. Try again in 10 minutes.", { "retry-after": "600" });
  if (recent && recent.n >= MAX_FAILURES) return locked();

  if (!(await sameText(given, env.ADMIN_PASSWORD))) {
    await env.WAITLIST.prepare("INSERT INTO attempts (ip_hash, at) VALUES (?1, ?2)").bind(key, new Date(now).toISOString()).run();
    // The fifth failure closes the door: from the next attempt on the answer is 429, right or wrong.
    if ((recent?.n ?? 0) + 1 >= MAX_FAILURES) {
      // The address itself is never kept; the start of its hash tells two sources apart.
      await audit(env, "portal.lockout", "operator", `${MAX_FAILURES} wrong passwords; address ${key.slice(6, 14)}`);
    }
    return fail(401, "wrong_password", "Wrong password.");
  }

  // Old failure rows of the portal are of no use after a day.
  await env.WAITLIST.prepare("DELETE FROM attempts WHERE ip_hash LIKE 'admin:%' AND at < ?1").bind(new Date(now - 86_400_000).toISOString()).run();
  await audit(env, "portal.sign_in", "operator");
  const value = await signSession(env.SESSION_KEY, now);
  return json(200, { expires_at: new Date(now + SESSION_TTL_MS).toISOString() }, { "set-cookie": sessionCookie(value) });
}

// ------------------------------------------------------------------------------------- waitlist

async function signups(env: Env): Promise<Signup[]> {
  if (!env.WAITLIST) throw new Refused(fail(503, "not_set_up", "The sign-up database is not attached."));
  const { results } = await env.WAITLIST.prepare(
    `SELECT id, email, lang, storage, storage_other, sources, sources_other, assistant, mode, note, created_at, invited_at
       FROM signups ORDER BY created_at DESC, id DESC`,
  ).all<Signup>();
  return results;
}

const invites = async (env: Env) => (await coreJson<{ invites: Invite[] }>(env, "GET", "/admin/invites")).invites;

/** Notes the invitation time in the sign-up rows of these emails (rows that have none yet). */
async function markInvited(env: Env, emails: string[], at: string | null): Promise<void> {
  if (!env.WAITLIST || !emails.length) return;
  const sql = at === null
    ? "UPDATE signups SET invited_at = NULL WHERE email = ?1"
    : "UPDATE signups SET invited_at = ?2 WHERE email = ?1 AND invited_at IS NULL";
  const db = env.WAITLIST;
  for (let i = 0; i < emails.length; i += 50) {
    await db.batch(emails.slice(i, i + 50).map((email) => (at === null ? db.prepare(sql).bind(email) : db.prepare(sql).bind(email, at))));
  }
}

interface InviteResult {
  added: string[];
  already: string[];
  invalid: string[];
}
const list = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

/** Puts emails on the core's invitation list, then notes the time in the sign-up list. */
async function invite(env: Env, emails: string[]): Promise<InviteResult> {
  if (!emails.length) return { added: [], already: [], invalid: [] };
  const answer = await coreJson<Partial<InviteResult>>(env, "POST", "/admin/invites", { emails });
  const result = { added: list(answer.added), already: list(answer.already), invalid: list(answer.invalid) };
  await markInvited(env, [...result.added, ...result.already], new Date().toISOString());
  return result;
}

// ------------------------------------------------------------------------------------- routes

const ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const pick = (url: URL, names: string[]) => {
  const out = new URLSearchParams();
  for (const name of names) {
    const value = url.searchParams.get(name);
    if (value) out.set(name, value);
  }
  const text = out.toString();
  return text ? `?${text}` : "";
};

async function api(request: Request, env: Env, url: URL): Promise<Response> {
  const method = request.method;
  const path = url.pathname.replace(/\/+$/, "");
  const changes = method !== "GET" && method !== "HEAD";
  const needsHeader = () => (request.headers.get("x-ke-admin") === "1" ? null : fail(403, "header_required", "This request needs the x-ke-admin header."));

  if (path === "/api/session" && method === "POST") return needsHeader() ?? (await signIn(request, env));

  const expires = await verifySession(env.SESSION_KEY ?? "", readCookie(request.headers.get("cookie"), COOKIE));
  if (expires === null) return fail(401, "signed_out", "Sign in first.");
  if (changes) {
    const refused = needsHeader();
    if (refused) return refused;
  }

  if (path === "/api/session") {
    if (method === "GET") return json(200, { expires_at: new Date(expires).toISOString() });
    if (method === "DELETE") {
      await audit(env, "portal.sign_out", "operator");
      return empty({ "set-cookie": clearedCookie() });
    }
  }

  if (path === "/api/overview" && method === "GET") {
    const [overview, rows, invited] = await Promise.all([coreJson<unknown>(env, "GET", "/admin/overview"), signups(env), invites(env)]);
    return json(200, { core: overview, waitlist: waitlistCounts(joinStatus(rows, invited)) });
  }

  if (path === "/api/waitlist" && method === "GET") {
    const [rows, invited] = await Promise.all([signups(env), invites(env)]);
    return json(200, { rows: joinStatus(rows, invited) });
  }
  if (path === "/api/waitlist.csv" && method === "GET") {
    return new Response(waitlistCsv(await signups(env)), {
      headers: { ...PRIVATE, "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="keepessence-enrolled.csv"' },
    });
  }
  if (path === "/api/waitlist/invite" && method === "POST") {
    const body = await readJson(request);
    const wanted = new Set(list(body.emails).map((e) => e.trim().toLowerCase()));
    // Only people who are on the sign-up list can be invited from it.
    const emails = (await signups(env)).map((r) => r.email).filter((email) => wanted.has(email));
    if (!emails.length) return fail(400, "nobody", "None of these emails is on the sign-up list.");
    const result = await invite(env, emails);
    await audit(env, "waitlist.invite", emails.length === 1 ? emails[0] : `${emails.length} emails`,
      `added ${result.added.length}, already invited ${result.already.length}, invalid ${result.invalid.length}`);
    return json(200, result);
  }

  if (path === "/api/invites") {
    if (method === "GET") {
      const [invited, overview] = await Promise.all([
        invites(env),
        coreJson<{ config?: { mail_configured?: boolean } }>(env, "GET", "/admin/overview"),
      ]);
      return json(200, { invites: invited, mail_configured: overview.config?.mail_configured === true });
    }
    if (method === "POST") {
      const body = await readJson(request);
      const parsed = parseEmails(typeof body.text === "string" ? body.text : list(body.emails).join("\n"));
      if (parsed.valid.length > 500) return fail(400, "too_many", "At most 500 emails at a time.");
      const result = await invite(env, parsed.valid);
      return json(200, { ...result, invalid: [...parsed.invalid, ...result.invalid] });
    }
    if (method === "DELETE") {
      const body = await readJson(request);
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!isEmail(email)) return fail(400, "bad_request", "An email is needed.");
      const res = await core(env, "DELETE", "/admin/invites", { email });
      if (res.ok) await markInvited(env, [email], null);
      return relay(res);
    }
  }

  if (path === "/api/login-codes" && method === "POST") {
    const body = await readJson(request);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!isEmail(email)) return fail(400, "bad_request", "An email is needed.");
    return relay(await core(env, "POST", "/admin/login-codes", { email }));
  }

  if (path === "/api/users" && method === "GET") return relay(await core(env, "GET", "/admin/users" + pick(url, ["q", "status", "cursor", "limit"])));
  if (path === "/api/usage" && method === "GET") return relay(await core(env, "GET", "/admin/usage" + pick(url, ["days"])));
  if (path === "/api/audit" && method === "GET") return relay(await core(env, "GET", "/admin/audit" + pick(url, ["cursor", "limit"])));

  const parts = path.split("/").slice(2); // ["users", id, …]
  if (parts[0] === "users" && parts[1] && ID.test(parts[1])) {
    const user = `/admin/users/${encodeURIComponent(parts[1])}`;
    if (parts.length === 2 && method === "GET") return relay(await core(env, "GET", user));
    if (parts.length === 2 && method === "DELETE") {
      const body = await readJson(request);
      return relay(await core(env, "DELETE", user, { confirm_email: typeof body.confirm_email === "string" ? body.confirm_email : "" }));
    }
    if (parts.length === 3 && method === "POST" && ["suspend", "restore", "sign-out"].includes(parts[2])) {
      return relay(await core(env, "POST", `${user}/${parts[2]}`));
    }
    if (parts.length === 4 && parts[2] === "devices" && ID.test(parts[3]) && method === "DELETE") {
      return relay(await core(env, "DELETE", `${user}/devices/${encodeURIComponent(parts[3])}`));
    }
  }

  return fail(404, "not_found", "No such route.");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      try {
        return await api(request, env, url);
      } catch (err) {
        if (err instanceof Refused) return err.response;
        console.error("portal request failed", err instanceof Error ? err.message : err);
        return fail(500, "failed", "Something went wrong.");
      }
    }
    if (request.method !== "GET" && request.method !== "HEAD") return fail(405, "method_not_allowed", "Use GET.");
    const page = await env.ASSETS.fetch(request);
    const headers = new Headers(page.headers);
    headers.set("x-robots-tag", "noindex, nofollow");
    headers.set("x-content-type-options", "nosniff");
    headers.set("referrer-policy", "no-referrer");
    headers.set("x-frame-options", "DENY");
    headers.set("content-security-policy", CSP);
    if ((headers.get("content-type") ?? "").includes("text/html")) headers.set("cache-control", "no-store, no-transform"); // no-transform: the hosting platform must not add its analytics script to this page
    return new Response(page.body, { status: page.status, statusText: page.statusText, headers });
  },
};
