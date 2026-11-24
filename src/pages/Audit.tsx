import { useEffect, useState } from "preact/hooks";
import { get } from "../api";
import { Loading, Table } from "../components/ui";
import { dateTime, t, tCode } from "../i18n";
import type { Audit, AuditEntry } from "../types";

export function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(cursor?: string | null) {
    setBusy(true);
    try {
      const page = await get<Audit>(`/api/audit?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      setEntries((prev) => (cursor ? [...(prev ?? []), ...page.entries] : page.entries));
      setNext(page.next_cursor);
    } catch (err) {
      setError(t("common.failed", { reason: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  if (!entries) return <Loading error={error} />;
  if (!entries.length) return <p class="sentence">{t("audit.empty")}</p>;
  return (
    <div class="stack">
      {error && <p class="bad" role="alert">{error}</p>}
      <Table label={t("nav.audit")}>
        <thead>
          <tr>
            <th>{t("audit.at")}</th>
            <th>{t("audit.action")}</th>
            <th>{t("audit.target")}</th>
            <th>{t("audit.detail")}</th>
            <th>{t("audit.source")}</th>
          </tr>
        </thead>
        <tbody data-testid="audit-rows">
          {entries.map((e) => (
            <tr key={e.id} data-action={e.action}>
              <td class="nowrap quiet">{dateTime(e.at)}</td>
              <td class="nowrap">{tCode("audit.a", e.action)}</td>
              <td class="break">{e.target}</td>
              <td class="break quiet">{e.detail}</td>
              <td class="nowrap quiet">{tCode("audit.source", e.source)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      {next && (
        <div>
          <button class="btn quiet" type="button" disabled={busy} onClick={() => void load(next)}>
            {t("common.more")}
          </button>
        </div>
      )}
    </div>
  );
}
