import { zh } from "./zh";
import { en } from "./en";
import { label as codeLabel, labels as codeLabels } from "./labels";

export type Lang = "zh" | "en";
export type Key = keyof typeof zh;
const dict: Record<Lang, Record<Key, string>> = { zh, en };

/** The interface follows the browser's language: Chinese for zh-*, English otherwise. */
export const lang = (): Lang => ((typeof navigator === "undefined" ? "en" : navigator.language || "en").toLowerCase().startsWith("zh") ? "zh" : "en");
if (typeof document !== "undefined") document.documentElement.lang = lang() === "zh" ? "zh-Hans" : "en";

const fill = (s: string, vars?: Record<string, string | number>) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;

export const t = (key: Key, vars?: Record<string, string | number>) => fill(dict[lang()][key], vars);
/** A string whose key is built from a code the server sent; the code itself when there is none. */
export const tCode = (prefix: string, code: string) => (dict[lang()] as Record<string, string>)[`${prefix}.${code}`] ?? code;

type Kind = Parameters<typeof codeLabel>[0];
export const label = (kind: Kind, code: string) => codeLabel(kind, code, lang());
export const labels = (kind: Kind, codes: string, other: string) => codeLabels(kind, codes, other, lang());

const locale = () => (lang() === "zh" ? "zh-CN" : "en-GB");

/** "2 hours ago" / "2小时前". */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return t("common.never");
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return t("common.just_now");
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: "always" });
  if (s < 3600) return rtf.format(-Math.floor(s / 60), "minute");
  if (s < 86400) return rtf.format(-Math.floor(s / 3600), "hour");
  return rtf.format(-Math.floor(s / 86400), "day");
}

/** A moment in the operator's own time zone: "24 Nov 2026, 17:12". */
export const dateTime = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat(locale(), { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : t("common.never");
export const clock = (iso: string) => new Intl.DateTimeFormat(locale(), { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
export const number = (n: number | null | undefined) => new Intl.NumberFormat(locale()).format(n ?? 0);

/** Bytes as a size a person reads: 734003200 → "700 MB". */
export function bytes(n: number | null | undefined): string {
  let value = Math.max(0, n ?? 0);
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${new Intl.NumberFormat(locale(), { maximumFractionDigits: value >= 100 || i === 0 ? 0 : 1 }).format(value)} ${units[i]}`;
}
