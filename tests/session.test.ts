// The session cookie: signing, expiry, tampering.
import { describe, expect, it } from "vitest";
import { COOKIE, SESSION_TTL_MS, clearedCookie, readCookie, sameText, sessionCookie, sha256Hex, signSession, verifySession } from "../src/shared/session";

const KEY = ["unit", "test", "signing", "key"].join("-");
const NOW = Date.UTC(2026, 10, 25, 9, 0, 0);

describe("session cookie", () => {
  it("accepts what it signed, until the expiry", async () => {
    const value = await signSession(KEY, NOW);
    expect(value.split(".")).toHaveLength(4);
    expect(await verifySession(KEY, value, NOW)).toBe(NOW + SESSION_TTL_MS);
    expect(await verifySession(KEY, value, NOW + SESSION_TTL_MS - 1)).toBe(NOW + SESSION_TTL_MS);
  });

  it("lasts 12 hours and not a millisecond more", async () => {
    expect(SESSION_TTL_MS).toBe(12 * 60 * 60 * 1000);
    const value = await signSession(KEY, NOW);
    expect(await verifySession(KEY, value, NOW + SESSION_TTL_MS)).toBeNull();
    expect(await verifySession(KEY, value, NOW + SESSION_TTL_MS + 60_000)).toBeNull();
  });

  it("refuses a later expiry written into a signed value", async () => {
    const [v, expires, random, mac] = (await signSession(KEY, NOW)).split(".");
    const longer = [v, String(Number(expires) + 86_400_000), random, mac].join(".");
    expect(await verifySession(KEY, longer, NOW)).toBeNull();
  });

  it("refuses a changed signature, a changed random part and another key", async () => {
    const value = await signSession(KEY, NOW);
    const [v, expires, random, mac] = value.split(".");
    const flipped = (mac.startsWith("A") ? "B" : "A") + mac.slice(1);
    expect(await verifySession(KEY, [v, expires, random, flipped].join("."), NOW)).toBeNull();
    // The last character has two spare bits: another spelling of the same bytes is refused too.
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    for (const last of alphabet) {
      const respelt = mac.slice(0, -1) + last;
      if (respelt !== mac) expect(await verifySession(KEY, [v, expires, random, respelt].join("."), NOW), last).toBeNull();
    }
    expect(await verifySession(KEY, [v, expires, random + "x", mac].join("."), NOW)).toBeNull();
    expect(await verifySession(KEY + "2", value, NOW)).toBeNull();
  });

  it("refuses values of the wrong shape, and everything when there is no key", async () => {
    const value = await signSession(KEY, NOW);
    for (const bad of ["", "v1", "a.b.c.d", `v2.${value.slice(3)}`, value + ".extra", value.replace(/\.[^.]+$/, ""), value.replace(/\.[^.]+$/, ".***"), `v1.notanumber.x.y`]) {
      expect(await verifySession(KEY, bad, NOW), bad).toBeNull();
    }
    expect(await verifySession(KEY, null, NOW)).toBeNull();
    expect(await verifySession("", value, NOW)).toBeNull();
    await expect(signSession("", NOW)).rejects.toThrow();
  });

  it("makes a different value each time", async () => {
    expect(await signSession(KEY, NOW)).not.toBe(await signSession(KEY, NOW));
  });

  it("sets a cookie only the server can read, sent only to this site over https", () => {
    const set = sessionCookie("abc");
    expect(set).toBe("ke_admin=abc; Max-Age=43200; HttpOnly; Secure; SameSite=Strict; Path=/");
    expect(clearedCookie()).toBe("ke_admin=; Max-Age=0; HttpOnly; Secure; SameSite=Strict; Path=/");
    expect(COOKIE).toBe("ke_admin");
  });

  it("reads its own cookie out of a Cookie header", () => {
    expect(readCookie("a=1; ke_admin=v1.2.3.4; b=2")).toBe("v1.2.3.4");
    expect(readCookie("xke_admin=no; ke_admin_old=no")).toBeNull();
    expect(readCookie(null)).toBeNull();
  });

  it("compares passwords whole, whatever their lengths", async () => {
    expect(await sameText("correct horse", "correct horse")).toBe(true);
    expect(await sameText("correct horse", "correct hors")).toBe(false);
    expect(await sameText("", "x")).toBe(false);
    expect(await sameText("", "")).toBe(true);
  });

  it("hashes an address the same way every time", async () => {
    expect(await sha256Hex("203.0.113.9")).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex("a")).toBe(await sha256Hex("a"));
    expect(await sha256Hex("a")).not.toBe(await sha256Hex("b"));
  });
});
