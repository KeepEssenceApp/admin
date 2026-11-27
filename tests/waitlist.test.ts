// The sign-up list: the spreadsheet guard, pasted emails, and the status of each row.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { csvCell, waitlistCsv } from "../src/shared/csv";
import { isEmail, parseEmails } from "../src/shared/emails";
import { joinStatus, mailLanguages, waitlistCounts, type Invite, type Signup } from "../src/shared/waitlist";
import { CSV_HEAD, LABELS, label, labels } from "../src/i18n/labels";
import { bytes } from "../src/i18n";
import { ROOT } from "./helpers";

const signup = (email: string, more: Partial<Signup> = {}): Signup => ({
  id: 1, email, lang: "en", storage: "readwise,other", storage_other: "Pinboard", sources: "hn,rss", sources_other: "",
  assistant: "claude", mode: "own-assistant", note: "", created_at: "2026-11-24T09:12:00.000Z", invited_at: null, ...more,
});
const invitation = (email: string, joined = false): Invite => ({
  email, invited_at: "2026-11-24T10:00:00.000Z", joined_at: joined ? "2026-11-24T11:00:00.000Z" : null, user_id: joined ? "usr_1" : null,
});

describe("spreadsheet guard", () => {
  it("puts a quote in front of a cell a spreadsheet would run as a formula", () => {
    expect(csvCell("=1+1")).toBe(`"'=1+1"`);
    expect(csvCell("+SUM(A1)")).toBe(`"'+SUM(A1)"`);
    expect(csvCell("-2")).toBe(`"'-2"`);
    expect(csvCell("@cmd")).toBe(`"'@cmd"`);
    expect(csvCell('=HYPERLINK("https://example.com","x")')).toBe(`"'=HYPERLINK(""https://example.com"",""x"")"`);
  });

  it("leaves ordinary cells alone, doubles quotes, and writes nothing for null", () => {
    expect(csvCell("plain")).toBe(`"plain"`);
    expect(csvCell('say "hi"')).toBe(`"say ""hi"""`);
    expect(csvCell("a,b\nc")).toBe(`"a,b\nc"`);
    expect(csvCell("a=b")).toBe(`"a=b"`);
    expect(csvCell(null)).toBe(`""`);
    expect(csvCell(undefined)).toBe(`""`);
  });

  it("writes the file the landing page writes: BOM, the nine columns, CRLF, labels", () => {
    const csv = waitlistCsv([signup("ada@example.com", { note: "=cmd|' /C calc'!A0", invited_at: "2026-11-25T01:00:00.000Z" })]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe("");
    expect(lines[0]).toBe(CSV_HEAD.map((h) => `"${h}"`).join(","));
    expect(CSV_HEAD).toHaveLength(9);
    expect(lines[1]).toBe(
      `"2026-11-24T09:12:00.000Z","ada@example.com","英文","Readwise、其他：Pinboard","Hacker News、RSS","Claude","接自己的助手","'=cmd|' /C calc'!A0","2026-11-25T01:00:00.000Z"`,
    );
  });

  it("guards an email that starts with a formula character too", () => {
    expect(waitlistCsv([signup("=x@example.com")])).toContain(`"'=x@example.com"`);
  });
});

describe("labels", () => {
  it("are the landing page's own labels", () => {
    const site = path.join(ROOT, "../site/worker.js");
    if (!fs.existsSync(site)) return;
    const source = fs.readFileSync(site, "utf8");
    const block = source.slice(source.indexOf("const LABELS = {") + "const LABELS = ".length);
    const theirs = new Function(`return (${block.slice(0, block.indexOf("\n};") + 2)});`)();
    expect(LABELS).toEqual(theirs);
    const head = source.match(/const head = (\[[^\]]+\]);/)![1];
    expect(CSV_HEAD).toEqual(new Function(`return ${head};`)());
  });

  it("fall back to the code, and carry what was typed for other", () => {
    expect(label("assistant", "something-new")).toBe("something-new");
    expect(labels("storage", "tabs,other", "备忘录")).toBe("浏览器标签页、其他：备忘录");
    expect(labels("storage", "tabs,other", "", "en")).toBe("Browser tabs, Other");
    expect(labels("sources", "", "")).toBe("");
  });
});

describe("pasted emails", () => {
  it("takes one per line or comma separated, trims and lower-cases", () => {
    expect(parseEmails(" Ada@Example.com \nbo@example.com, chen@example.com;dana@example.com")).toEqual({
      valid: ["ada@example.com", "bo@example.com", "chen@example.com", "dana@example.com"],
      invalid: [],
    });
  });

  it("accepts Chinese punctuation, tabs and blank lines", () => {
    expect(parseEmails("a@example.com，b@example.com；c@example.com、d@example.com\n\n\te@example.com\r\n").valid).toEqual([
      "a@example.com", "b@example.com", "c@example.com", "d@example.com", "e@example.com",
    ]);
  });

  it("keeps each email once and reports what is not an email", () => {
    expect(parseEmails("a@example.com\nA@example.com\nnot-an-email\nb@\n@c.com\nd@example\n<e@example.com>")).toEqual({
      valid: ["a@example.com", "e@example.com"],
      invalid: ["not-an-email", "b@", "@c.com", "d@example"],
    });
  });

  it("returns nothing for nothing", () => {
    expect(parseEmails("")).toEqual({ valid: [], invalid: [] });
    expect(parseEmails(" \n , ")).toEqual({ valid: [], invalid: [] });
  });

  it("uses the landing page's test for an email", () => {
    expect(isEmail("a@b.co")).toBe(true);
    expect(isEmail("a b@c.co")).toBe(false);
    expect(isEmail(`${"a".repeat(250)}@b.co`)).toBe(false);
  });
});

describe("status of a sign-up", () => {
  const rows = joinStatus(
    [signup("new@example.com"), signup("Invited@Example.com", { invited_at: "2026-11-24T09:59:00.000Z" }), signup("joined@example.com"), signup("stale@example.com", { invited_at: "2026-11-20T00:00:00.000Z" })],
    [invitation("invited@example.com"), invitation("joined@example.com", true), invitation("someone.else@example.com")],
  );

  it("is new, invited or joined by the core's invitation list, matched by email", () => {
    expect(rows.map((r) => r.status)).toEqual(["new", "invited", "joined", "new"]);
  });

  it("does not trust invited_at alone: a withdrawn invitation is new again", () => {
    expect(rows[3].status).toBe("new");
  });

  it("carries the account and the times", () => {
    expect(rows[2]).toMatchObject({ user_id: "usr_1", joined_at: "2026-11-24T11:00:00.000Z", invited_at: "2026-11-24T10:00:00.000Z" });
    expect(rows[1].invited_at).toBe("2026-11-24T09:59:00.000Z");
    expect(rows[0]).toMatchObject({ user_id: null, joined_at: null, invited_at: null });
  });

  it("counts sign-ups, invited (joined included) and joined", () => {
    expect(waitlistCounts(rows)).toEqual({ signups: 4, invited: 2, joined: 1 });
    expect(waitlistCounts([])).toEqual({ signups: 0, invited: 0, joined: 0 });
  });
});

describe("storage size", () => {
  it("is written the way a person reads it", () => {
    expect(bytes(0)).toBe("0 B");
    expect(bytes(900)).toBe("900 B");
    expect(bytes(1536)).toBe("1.5 KB");
    expect(bytes(734_003_200)).toBe("700 MB");
    expect(bytes(5 * 1024 ** 3)).toBe("5 GB");
  });
});

describe("the language of the invitation mail", () => {
  it("is the page the person signed up from, in the core's names: zh-Hans is zh, en is en", () => {
    const rows = [signup("ada@example.com", { lang: "en" }), signup("bo@example.com", { lang: "zh-Hans" }), signup("cy@example.com", { lang: "zh" }), signup("dee@example.com", { lang: "en-GB" })];
    expect(mailLanguages(rows, ["ada@example.com", "bo@example.com", "cy@example.com", "dee@example.com"])).toEqual({
      "ada@example.com": "en",
      "bo@example.com": "zh",
      "cy@example.com": "zh",
      "dee@example.com": "en",
    });
  });

  it("matches emails the way the list does (trimmed, lower-cased), and only the ones asked for", () => {
    const rows = [signup(" Ada@Example.com ", { lang: "en" }), signup("bo@example.com", { lang: "zh-Hans" })];
    expect(mailLanguages(rows, ["ADA@example.com"])).toEqual({ "ada@example.com": "en" });
  });

  it("leaves out a language that is neither, and an email with no sign-up row, so the core uses its default", () => {
    const rows = [signup("ada@example.com", { lang: "fr" }), signup("bo@example.com", { lang: "" })];
    expect(mailLanguages(rows, ["ada@example.com", "bo@example.com", "nobody@example.com"])).toEqual({});
  });

  it("takes the newest of several rows for one email (the list comes newest first)", () => {
    const rows = [signup("ada@example.com", { id: 2, lang: "zh-Hans" }), signup("ada@example.com", { id: 1, lang: "en" })];
    expect(mailLanguages(rows, ["ada@example.com"])).toEqual({ "ada@example.com": "zh" });
  });
});
