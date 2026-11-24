// Copies the files this repo takes from the spec and site repos (checked out next to it).
import fs from "node:fs";
const pairs = [
  ["../spec/design/tokens.css", "design/tokens.css"],
  ["../spec/design/terms.md", "design/terms.md"],
  ["../spec/product/glossary.md", "design/glossary.md"],
  ["../site/migrations/0001_waitlist.sql", "dev/waitlist/0001_waitlist.sql"],
];
for (const [from, to] of pairs) {
  fs.copyFileSync(from, to);
  console.log(`${from} -> ${to}`);
}
