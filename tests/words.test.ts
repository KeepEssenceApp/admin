// The portal only uses the words of design/terms.md; none of the banned words appears.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { zh } from "../src/i18n/zh";
import { en } from "../src/i18n/en";
import { LABELS, LABELS_EN } from "../src/i18n/labels";
import { ROOT, read, walk } from "./helpers";

/** Banned words, read from the two documents at test time. */
function banned() {
  const terms = read("design/terms.md").split("\n").find((l) => l.startsWith("不用的词"))!;
  const glossary = read("design/glossary.md");
  const section = glossary.slice(glossary.indexOf("## 不用的词"));
  const lines = section.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  const plain = lines[0];
  const metaphors = lines[1].slice(lines[1].indexOf("包括：") + 3);
  const clean = (w: string) => w.replace(/（[^）]*）/g, "").replace(/[。.]$/, "").trim();
  const zhWords = new Set<string>();
  const enWords = new Set<string>();
  for (const part of terms.replace(/^不用的词（[^）]*）：/, "").replace(/，以及任何比喻。?$/, "").split("、")) {
    const m = clean(part).match(/^([一-鿿]+)?\s*([A-Za-z][A-Za-z ]*)?$/);
    if (m?.[1]) zhWords.add(m[1]);
    if (m?.[2]) enWords.add(m[2].trim().toLowerCase());
  }
  for (const part of [...plain.split("、"), ...metaphors.split("、")]) {
    const w = clean(part);
    if (!w) continue;
    if (/^[A-Za-z ]+$/.test(w)) enWords.add(w.toLowerCase());
    else zhWords.add(w);
  }
  // As in the web app: the glossary's metaphor list names 深挖, which design/terms.md requires.
  zhWords.delete("深挖");
  return { zhWords, enWords };
}

const { zhWords, enWords } = banned();
// "token" is banned in what users see. The portal is for the operator, and its design
// (product/admin.md) itself says the usage pages show "token": that one word is let through.
const operatorOnly = new Set(["token"]);
const check = (w: string) => !operatorOnly.has(w);
const flat = (maps: Record<string, Record<string, string>>) => Object.entries(maps).flatMap(([kind, m]) => Object.entries(m).map(([code, v]) => [`${kind}.${code}`, v] as const));

describe("words", () => {
  it("reads a real list of banned words", () => {
    for (const w of ["书签", "知识库", "搜索", "首页", "喜欢", "钥匙", "蜂巢", "token"]) expect(zhWords.has(w) || enWords.has(w)).toBe(true);
    for (const w of ["bookmark", "search", "home", "settings", "api key", "like"]) expect(enWords.has(w)).toBe(true);
  });

  it("has no banned word in the Chinese dictionary and labels", () => {
    const hits: string[] = [];
    for (const [key, value] of [...Object.entries(zh), ...flat(LABELS)]) {
      for (const w of zhWords) if (value.includes(w)) hits.push(`${key}: ${w}`);
      for (const w of enWords) if (check(w) && new RegExp(`\\b${w}s?\\b`, "i").test(value)) hits.push(`${key}: ${w}`);
    }
    expect(hits).toEqual([]);
  });

  it("has no banned word in the English dictionary and labels", () => {
    const hits: string[] = [];
    for (const [key, value] of [...Object.entries(en), ...flat(LABELS_EN)]) {
      for (const w of enWords) if (check(w) && new RegExp(`\\b${w}s?\\b`, "i").test(value)) hits.push(`${key}: ${w}`);
      for (const w of zhWords) if (value.includes(w)) hits.push(`${key}: ${w}`);
    }
    expect(hits).toEqual([]);
  });

  it("names the entries as the portal's design does, and uses the term table's words", () => {
    expect([zh["nav.overview"], zh["nav.waitlist"], zh["nav.invites"], zh["nav.users"], zh["nav.usage"], zh["nav.audit"], zh["nav.signout"]])
      .toEqual(["概览", "报名名单", "邀请", "用户", "用量", "记录", "退出"]);
    const table = read("design/terms.md");
    for (const [a, b] of [["退出", "Sign out"], ["撤销", "Revoke"], ["内置助手", "Built-in assistant"], ["每日摘要", "Daily digest"], ["通知", "Notifications"]]) {
      expect(table).toContain(`| ${a} | ${b} |`);
      expect(Object.values(zh)).toContain(a);
      expect(Object.values(en)).toContain(b);
    }
    expect(table).toContain("| 只存入 / 读 / 管理 | Save only / Read / Manage |");
    expect([zh["user.tier.save"], zh["user.tier.read"], zh["user.tier.manage"]]).toEqual(["只存入", "读", "管理"]);
    expect([en["user.tier.save"], en["user.tier.read"], en["user.tier.manage"]]).toEqual(["Save only", "Read", "Manage"]);
    expect(table).toContain("| 定时型 / 对话型 | Scheduled / Chat |");
    expect([zh["user.kind.scheduled"], zh["user.kind.chat"], en["user.kind.scheduled"], en["user.kind.chat"]]).toEqual(["定时型", "对话型", "Scheduled", "Chat"]);
  });

  it("has both languages for every string, and none empty", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
    for (const [k, v] of [...Object.entries(zh), ...Object.entries(en)]) expect(v, k).not.toBe("");
    for (const kind of Object.keys(LABELS) as (keyof typeof LABELS)[]) expect(Object.keys(LABELS_EN[kind]).sort()).toEqual(Object.keys(LABELS[kind]).sort());
  });

  it("keeps Chinese text out of the components: every visible string is in a dictionary", () => {
    const hits = walk("src", [".tsx", ".ts"])
      .filter((f) => !f.includes(`${path.sep}i18n${path.sep}`))
      .filter((f) => /[一-鿿]/.test(read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
    expect(hits).toEqual([]);
  });

  it("works from copies that match the spec and site repos", () => {
    for (const [mine, theirs] of [["design/tokens.css", "../spec/design/tokens.css"], ["design/terms.md", "../spec/design/terms.md"], ["design/glossary.md", "../spec/product/glossary.md"], ["dev/waitlist/0001_waitlist.sql", "../site/migrations/0001_waitlist.sql"]]) {
      const other = path.join(ROOT, theirs);
      if (fs.existsSync(other)) expect(read(mine), `${mine} differs from its source; run npm run sync:spec`).toBe(fs.readFileSync(other, "utf8"));
    }
  });
});
