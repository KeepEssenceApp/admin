// Every colour in the portal comes from design/tokens.css, and the portal's own interface uses
// no gold. The one exception is the brand's own image files: the mark carries one gold dot.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { gold, read, tokenColours, tokenNames, walk } from "./helpers";

const NAMED = ["black", "white", "red", "green", "yellow", "blue", "gray", "grey", "gold", "orange", "purple", "pink", "silver", "navy", "teal", "lime", "aqua", "maroon", "olive", "brown", "crimson", "tomato", "goldenrod", "whitesmoke", "gainsboro", "darkgray", "dimgray", "lightgray", "lightgrey"];
const sources = walk("src", [".css", ".tsx", ".ts"]);
const pages = ["index.html", ...walk("public", [".svg", ".html", ".webmanifest", ".js"])];
// The brand's files, copied byte for byte from the brand resources (sha256). They are never
// recoloured or edited by hand: a changed file fails here. Only these may hold gold.
const BRAND: Record<string, string> = {
  "public/icons/mark-black.svg": "fc3446a2331f6c8aa954dec98abdc81c0d705375dcc37be3cb816e8c79e30354",
  "public/icons/mark-white.svg": "757aa7391e4239b6ed8071e14532457c9ae2b179141381d191c5ef6e95207f93",
  "public/icons/mark-small-black.svg": "e678ab46b70a9ce3795576267f1f85991333f4abcc3f1cd86a86ac557a1c3971",
  "public/icons/mark-small-white.svg": "71e88e44f012bded88fa9f9358afc38408645f87cb5fb46e628cf713faf3068f",
  // The browser-tab icon is the brand's app icon: the same mark, its dot drawn with a gradient.
  "public/icons/favicon.svg": "c3e8c6a4e26cb7a043cd5afd59ec1e4caa28e513a8ea4f298c98d793085848d6",
};
const MARKS = Object.keys(BRAND).filter((f) => f.includes("/mark-"));
const own = (files: string[]) => files.filter((f) => !(f in BRAND));
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

  it("has the brand's files unchanged, and no other image in public/", () => {
    for (const [file, sum] of Object.entries(BRAND)) expect(createHash("sha256").update(read(file)).digest("hex"), file).toBe(sum);
    expect(walk("public", [".svg"]).sort()).toEqual(Object.keys(BRAND).sort());
  });

  it("allows gold in one place only: the dot inside the brand mark", () => {
    for (const file of MARKS) {
      const text = read(file);
      const colours = [...text.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toUpperCase());
      // One gold value, and it is the fill of the one circle. Everything else is black or white.
      expect(colours.filter((c) => c === gold()), file).toHaveLength(1);
      expect(text.match(/<circle\b[^>]*>/g), file).toHaveLength(1);
      expect(text, file).toMatch(new RegExp(`<circle\\b[^>]*fill="${gold()}"`, "i"));
      const ink = file.includes("white") ? "#FFFFFF" : "#0B0B0B";
      expect(new Set(colours.filter((c) => c !== gold())), file).toEqual(new Set([ink]));
    }
  });

  it("never uses gold anywhere else: not the token, not its value, not in its own pages", () => {
    const hits: string[] = [];
    for (const file of own([...sources, ...pages])) {
      const text = read(file);
      if (/--ke-gold\b/.test(strip(text))) hits.push(`${file}: --ke-gold`);
      if (text.toUpperCase().includes(gold())) hits.push(`${file}: ${gold()}`);
      if (/\bgold\b/i.test(strip(text).replace(/[`'"][^`'"\n]*[`'"]/g, "")) && file.endsWith(".css")) hits.push(`${file}: gold`);
    }
    expect(gold()).toBe("#C5A229");
    expect(hits).toEqual([]);
  });

  it("has the spec's one scale of rounding in its copy of the tokens (spec e139a47)", () => {
    const radii = Object.fromEntries([...read("design/tokens.css").matchAll(/(--ke-radius[a-z-]*)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
    expect(radii).toEqual({
      "--ke-radius-mark": "0",
      "--ke-radius-tag": "8px",
      "--ke-radius": "14px",
      "--ke-radius-card": "20px",
      "--ke-radius-sheet": "28px",
      "--ke-radius-control": "999px",
    });
  });

  it("uses only the token radii (0, 8, 14, 20, 28 and the pill) and circles", () => {
    const bad: string[] = [];
    for (const m of strip(read("src/styles/app.css")).matchAll(/border-radius\s*:\s*([^;]+);/g)) {
      const parts = m[1].trim().split(/\s+/);
      if (!parts.every((p) => /^var\(--ke-radius(-mark|-tag|-card|-sheet|-control)?\)$/.test(p) || p === "0" || p === "50%")) bad.push(m[1]);
    }
    expect(bad).toEqual([]);
  });

  it("rounds fields, buttons and sheets by the level the spec names for each", () => {
    // Fields 14, buttons and the segmented switch a pill, a dialog the sheet's 28 (its top corners on a phone, as in the web client).
    const css = strip(read("src/styles/app.css"));
    const radiusOf = (selector: string) =>
      [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((m) => m[1].split(",").map((s) => s.trim().replace(/\s+/g, " ")).includes(selector))
        .flatMap((m) => [...m[2].matchAll(/border-radius\s*:\s*([^;]+?)\s*(?:;|$)/g)].map((r) => r[1]));
    expect(radiusOf('input[type="text"]')).toEqual(["var(--ke-radius)"]);
    expect(radiusOf("textarea")).toEqual(["var(--ke-radius)"]);
    expect(radiusOf("select")).toEqual(["var(--ke-radius)"]);
    expect(radiusOf(".btn")).toEqual(["var(--ke-radius-control)"]);
    expect(radiusOf(".segments")).toEqual(["var(--ke-radius-control)"]);
    expect(radiusOf(".sheet")).toEqual(["var(--ke-radius-sheet)", "var(--ke-radius-sheet) var(--ke-radius-sheet) 0 0"]);
  });

  it("keeps the page and the icons within the token colours", () => {
    const allowed = tokenColours();
    // The browser-tab icon is the brand's file (checked byte for byte above); the marks are held to the tokens.
    const used = pages.filter((f) => f !== "public/icons/favicon.svg").flatMap((file) => [...read(file).matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toUpperCase()));
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((c) => !allowed.has(c))).toEqual([]);
  });

  it("has no green and no yellow among the tokens it relies on", () => {
    // Red is the only functional colour. Gold and its text colour (--ke-gold-ink: #795600 light, #F2D27D dark) are in the token
    // file, but the portal's own interface never uses either.
    expect([...tokenColours()].sort()).toEqual(
      [
        "#0B0B0B", "#191817", "#252321", "#292725", "#343231", "#383532", "#45403D", "#605B59", "#625C57", "#795600",
        "#B3261E", "#BDB5AF", "#C5A229", "#D7D1CF", "#DDD7D2", "#EEECEC", "#EFEBE7", "#F2877B", "#F2D27D", "#F5F5F3",
        "#F6F3F0", "#F9F6F4", "#FFFDFC", "#FFFFFF",
      ].sort(),
    );
  });

  it("uses red only through the danger token", () => {
    // Delete, suspend and what is broken: the places are few enough to list.
    const uses = [...strip(read("src/styles/app.css")).matchAll(/([^{}]+)\{[^}]*var\(--ke-danger\)[^}]*\}/g)].map((m) => m[1].trim().split("\n").pop()!.trim());
    expect(uses.sort()).toEqual([".bad", ".btn.danger", ".btn.quiet.danger", ".dot.danger", ".said.bad"].sort());
  });
});
