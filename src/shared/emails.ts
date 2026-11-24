// Turns what the operator typed or pasted into a list of emails.

/** The same test as the landing page's form. */
export const isEmail = (value: string) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/**
 * One per line, or separated by commas, semicolons or spaces (Chinese punctuation too).
 * Trimmed, lower-cased, each kept once, in the order given.
 */
export function parseEmails(text: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const raw of String(text ?? "").split(/[\s,;，；、]+/)) {
    // "Name <a@b.c>" pasted from a mail program leaves "<a@b.c>".
    const value = raw.trim().replace(/^<|>$/g, "").toLowerCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    (isEmail(value) ? valid : invalid).push(value);
  }
  return { valid, invalid };
}
