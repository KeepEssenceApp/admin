// The sign-up list: the spreadsheet guard, pasted emails, and the status of each row.
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { csvCell, waitlistCsv } from "../src/shared/csv";
import { isEmail, parseEmails } from "../src/shared/emails";
import { inviteNote, joinStatus, mailLanguages, waitlistCounts, type Invite, type InviteAnswer, type Signup } from "../src/shared/waitlist";
import { CSV_HEAD, LABELS, label, labels } from "../src/i18n/labels";
import { bytes, t } from "../src/i18n";
import { zh } from "../src/i18n/zh";
import { en } from "../src/i18n/en";
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

// The sentence after inviting from the sign-up list follows what the core answered, not how many were submitted.
// Synthetic data only: example.com addresses, an in-memory stand-in for the core, nothing is sent anywhere.
describe("the sentence after inviting from the sign-up list", () => {
  afterEach(() => vi.unstubAllGlobals());
  const say = (lang: "zh-CN" | "en-GB", emails: string[], answer: InviteAnswer) => {
    vi.stubGlobal("navigator", { language: lang });
    const note = inviteNote(emails, answer);
    return { ...note, text: t(note.key, note.vars) };
  };
  /** As the core's POST /admin/invites: a new address is added, one on the list already is left alone. */
  const fakeCore = () => {
    const list = new Set<string>();
    return (emails: string[]): InviteAnswer => {
      const out: InviteAnswer = { added: [], already: [], invalid: [] };
      for (const raw of emails) {
        const email = raw.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) out.invalid.push(raw);
        else if (list.has(email)) out.already.push(email);
        else {
          list.add(email);
          out.added.push(email);
        }
      }
      return out;
    };
  };
  const ASKED = "one invitation mail is requested";

  it("one person, two operators: the first invite says a mail is requested, the second says it was already on the list and asks for nothing", () => {
    const core = fakeCore();
    const email = "new.ada@example.com";
    const first = core([email]);
    const second = core([email]);
    expect([first.added, first.already]).toEqual([[email], []]);
    expect([second.added, second.already]).toEqual([[], [email]]);

    const zh1 = say("zh-CN", [email], first);
    expect(zh1.key).toBe("waitlist.done_one");
    expect(zh1.text).toContain("请求发一封邀请通知");
    expect(zh1.bad).toBe(false);
    const zh2 = say("zh-CN", [email], second);
    expect(zh2.key).toBe("waitlist.done_one_already");
    expect(zh2.text).toBe("new.ada@example.com 本来就在邀请名单里，这次没有再请求邀请通知，原来的状态在「邀请」页看。");
    expect(zh2.text).not.toContain("请求发一封");
    expect(zh2.text).not.toContain("已邀请");
    expect(zh2.bad).toBe(false);

    const en1 = say("en-GB", [email], first);
    expect(en1.key).toBe("waitlist.done_one");
    expect(en1.text).toContain(ASKED);
    const en2 = say("en-GB", [email], second);
    expect(en2.key).toBe("waitlist.done_one_already");
    expect(en2.text).toBe("new.ada@example.com was already on the invitation list, so no new invitation mail was requested. Its state is on Invitations.");
    expect(en2.text).not.toContain(ASKED);
    expect(en2.text).not.toContain("Invited ");
  });

  it("matches the address the way the list does: trimmed, lower-cased", () => {
    expect(inviteNote(["New.Ada@Example.com"], { added: [], already: ["new.ada@example.com"], invalid: [] }).key).toBe("waitlist.done_one_already");
    expect(inviteNote([" new.ada@example.com "], { added: ["new.ada@example.com"], already: [], invalid: [] }).key).toBe("waitlist.done_one");
  });

  it("one person the core did not take (invalid), or its answer does not mention: the existing 'invalid' sentence, as a failure, never 'invited'", () => {
    for (const answer of [{ added: [], already: [], invalid: ["bad.address"] }, { added: [], already: [], invalid: [] }]) {
      const zh = say("zh-CN", ["bad.address"], answer);
      expect(zh.key).toBe("invites.add_invalid");
      expect(zh.text).toBe("无效的：bad.address");
      expect(zh.bad).toBe(true);
      const en = say("en-GB", ["bad.address"], answer);
      expect(en.text).toBe("Invalid: bad.address");
      expect(en.bad).toBe(true);
      expect(en.text).not.toContain(ASKED);
    }
  });

  it("an answer about other people does not decide it: only this address counts", () => {
    const answer = { added: ["new.bo@example.com"], already: ["new.chen@example.com"], invalid: [] };
    expect(inviteNote(["new.ada@example.com"], answer).key).toBe("invites.add_invalid");
  });

  it("several people keep the counts sentence, whatever the answer", () => {
    const core = fakeCore();
    const emails = ["new.ada@example.com", "new.bo@example.com"];
    core(["new.bo@example.com"]);
    const answer = core(emails);
    expect([answer.added.length, answer.already.length]).toEqual([1, 1]);
    const zh = say("zh-CN", emails, answer);
    expect(zh.key).toBe("waitlist.done_many");
    expect(zh.text).toBe("已邀请 1 人，另有 1 人本来就在邀请名单里。配好发信服务时，每个新邀请的人会请求发一封邀请通知，结果在「邀请」页看。");
    expect(say("en-GB", emails, answer).text).toBe("New invitations: 1. Already on the invitation list: 1. When mail is configured, one invitation mail is requested for each new invitation; its state is on Invitations.");
    // All of them already on the list: still the many-sentence (its counts say 0 and 2); that branch is not changed here.
    const all = core(emails);
    expect(inviteNote(emails, all).key).toBe("waitlist.done_many");
    expect(say("en-GB", emails, all).text).toBe("New invitations: 0. Already on the invitation list: 2. When mail is configured, one invitation mail is requested for each new invitation; its state is on Invitations.");
  });

  it("the English counts sentence reads for any count, with no singular or plural to get wrong: 'label: number'", () => {
    for (const [added, already] of [[2, 0], [0, 2], [1, 1], [1, 0], [0, 1], [5, 3]]) {
      const answer = { added: Array.from({ length: added }, (_, i) => `a${i}@example.com`), already: Array.from({ length: already }, (_, i) => `b${i}@example.com`), invalid: [] };
      const text = say("en-GB", ["x@example.com", "y@example.com"], answer).text;
      expect(text).toBe(`New invitations: ${added}. Already on the invitation list: ${already}. When mail is configured, one invitation mail is requested for each new invitation; its state is on Invitations.`);
      expect(text).not.toMatch(/people|were|more|Invited/);
    }
  });

  it("the Chinese counts sentence is the one it was", () => {
    expect(zh["waitlist.done_many"]).toBe("已邀请 {added} 人，另有 {already} 人本来就在邀请名单里。配好发信服务时，每个新邀请的人会请求发一封邀请通知，结果在「邀请」页看。");
  });

  it("has the new sentence in both languages, with the address in it", () => {
    expect(zh["waitlist.done_one_already"]).toContain("{email}");
    expect(en["waitlist.done_one_already"]).toContain("{email}");
  });
});
