// The operator's session: a signed cookie. Nothing is stored on the server.
//   ke_admin = v1.<expiry in ms>.<random>.<HMAC-SHA-256 of the part before, base64url>
// Runs in the Worker and, for the unit tests, in Node (both have Web Crypto).

export const COOKIE = "ke_admin";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const enc = new TextEncoder();

const toB64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

function fromB64url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

const hmacKey = (secret: string) =>
  crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export async function sha256Hex(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", enc.encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A new session value that stops working `ttl` ms after `now`. */
export async function signSession(secret: string, now = Date.now(), ttl = SESSION_TTL_MS): Promise<string> {
  if (!secret) throw new Error("no session key");
  const random = toB64url(crypto.getRandomValues(new Uint8Array(12)));
  const payload = `v1.${now + ttl}.${random}`;
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(payload));
  return `${payload}.${toB64url(new Uint8Array(mac))}`;
}

/** The expiry (ms) of a valid session value; null when it is forged, changed or expired. */
export async function verifySession(secret: string, value: string | null | undefined, now = Date.now()): Promise<number | null> {
  if (!secret || !value) return null;
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || !/^\d{1,16}$/.test(parts[1])) return null;
  const mac = fromB64url(parts[3]);
  // One spelling per signature: the last character of base64url has spare bits that decode to the same bytes.
  if (!mac || toB64url(mac) !== parts[3]) return null;
  // subtle.verify compares in constant time.
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), mac, enc.encode(parts.slice(0, 3).join(".")));
  if (!ok) return null;
  const expires = Number(parts[1]);
  return expires > now ? expires : null;
}

/** Compares two texts without stopping at the first different character, whatever their lengths. */
export async function sameText(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([a, b].map((v) => crypto.subtle.digest("SHA-256", enc.encode(v))));
  const p = new Uint8Array(x);
  const q = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < p.length; i++) diff |= p[i] ^ q[i];
  return diff === 0;
}

export function readCookie(header: string | null, name = COOKIE): string | null {
  for (const part of (header ?? "").split(";")) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return null;
}

const ATTRS = "HttpOnly; Secure; SameSite=Strict; Path=/";
export const sessionCookie = (value: string, ttl = SESSION_TTL_MS) => `${COOKIE}=${value}; Max-Age=${Math.floor(ttl / 1000)}; ${ATTRS}`;
export const clearedCookie = () => `${COOKIE}=; Max-Age=0; ${ATTRS}`;
