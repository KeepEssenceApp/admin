// Every colour in the portal comes from design/tokens.css, and the gold token is not used at all.
import { describe, expect, it } from "vitest";
import { gold, read, tokenColours, tokenNames, walk } from "./helpers";

const NAMED = ["black", "white", "red", "green", "yellow", "blue", "gray", "grey", "gold", "orange", "purple", "pink", "silver", "navy", "teal", "lime", "aqua", "maroon", "olive", "brown", "crimson", "tomato", "goldenrod", "whitesmoke", "gainsboro", "darkgray", "dimgray", "lightgray", "lightgrey"];
const sources = walk("src", [".css", ".tsx", ".ts"]);
const pages = ["index.html", ...walk("public", [".svg", ".html", ".webmanifest", ".js"])];
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("colours", () => {
  it("has no colour literal in CSS, TSX or TS", () => {
    const found: string[] = [];
    for (const file of sources) {
      const text = strip(read(file));
      for (const m of text.matchAll(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\s*\(/g)) found.push(`${file}: ${m[0]}`);
    }
    expect(found).toEqual([]);
  });

  it("uses no named colour in a CSS declaration", () => {
    const found: string[] = [];
    for (const file of sources.filter((f) => f.endsWith(".css"))) {
      for (const m of strip(read(file)).matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)) {
        const value = m[2].replace(/var\([^)]*\)/g, "");
        for (const name of NAMED) if (new RegExp(`(^|[\\s,(])${name}($|[\\s,)])`, "i").test(value)) found.push(`${file}: ${m[1]}: ${m[2]}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("only refers to tokens that exist", () => {
    const names = tokenNames();
    const missing: string[] = [];
    for (const file of sources) for (const m of read(file).matchAll(/var\((--[a-z0-9-]+)/g)) if (!names.has(m[1])) missing.push(`${file}: ${m[1]}`);
    expect(missing).toEqual([]);
  });

  it("never uses gold: not the token, not its value, not in the icons", () => {
    const hits: string[] = [];
    for (const file of [...sources, ...pages]) {
      const text = read(file);
      if (/--ke-gold\b/.test(strip(text))) hits.push(`${file}: --ke-gold`);
      if (text.toUpperCase().includes(gold())) hits.push(`${file}: ${gold()}`);
      if (/\bgold\b/i.test(strip(text).replace(/[`'"][^`'"\n]*[`'"]/g, "")) && file.endsWith(".css")) hits.push(`${file}: gold`);
    }
    expect(gold()).toBe("#C5A229");
    expect(hits).toEqual([]);
  });

  it("uses only the token radii (0, 4, 6, 10) and circles", () => {
    const bad: string[] = [];
    for (const m of strip(read("src/styles/app.css")).matchAll(/border-radius\s*:\s*([^;]+);/g)) {
      const parts = m[1].trim().split(/\s+/);
      if (!parts.every((p) => /^var\(--ke-radius(-mark|-tag|-sheet)?\)$/.test(p) || p === "0" || p === "50%")) bad.push(m[1]);
    }
    expect(bad).toEqual([]);
  });

  it("keeps the page and the icons within the token colours", () => {
    const allowed = tokenColours();
    const used = pages.flatMap((file) => [...read(file).matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toUpperCase()));
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((c) => !allowed.has(c))).toEqual([]);
  });

  it("has no green and no yellow among the tokens it relies on", () => {
    // Red is the only functional colour. Gold is in the token file but the portal never uses it.
    expect([...tokenColours()].sort()).toEqual(
      ["#0B0B0B", "#161616", "#1F1F1F", "#2C2C2C", "#4A4A4A", "#6B6B6B", "#929290", "#B3261E", "#B9B9B5", "#C5A229", "#DEDEDA", "#EAEAE7", "#F2877B", "#F5F5F3", "#FFFFFF"].sort(),
    );
  });

  it("uses red only through the danger token", () => {
    // Delete, suspend and what is broken: the places are few enough to list.
    const uses = [...strip(read("src/styles/app.css")).matchAll(/([^{}]+)\{[^}]*var\(--ke-danger\)[^}]*\}/g)].map((m) => m[1].trim().split("\n").pop()!.trim());
    expect(uses.sort()).toEqual([".bad", ".btn.danger", ".btn.quiet.danger", ".dot.danger", ".said.bad"].sort());
  });
});
