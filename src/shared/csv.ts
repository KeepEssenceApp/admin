// The sign-up list as a spreadsheet file: the same columns and labels as the landing page's
// own /enrolled.csv.
import { CSV_HEAD, label, labels } from "../i18n/labels";
import type { Signup } from "./waitlist";

/** Spreadsheet programs run a cell that starts with = + - or @ as a formula; a leading quote stops that. */
export function csvCell(value: unknown): string {
  let s = String(value ?? "");
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function waitlistCsv(rows: Signup[]): string {
  const lines = rows.map((r) =>
    [
      r.created_at, r.email, label("lang", r.lang), labels("storage", r.storage, r.storage_other),
      labels("sources", r.sources, r.sources_other), label("assistant", r.assistant), label("mode", r.mode), r.note, r.invited_at || "",
    ].map(csvCell).join(","),
  );
  // The BOM makes Excel read the file as UTF-8.
  return "﻿" + [CSV_HEAD.map(csvCell).join(","), ...lines].join("\r\n") + "\r\n";
}
