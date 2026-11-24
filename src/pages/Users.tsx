import { useEffect, useState } from "preact/hooks";
import { get } from "../api";
import { Loading, State, Table } from "../components/ui";
import { ago, bytes, dateTime, number, t } from "../i18n";
import type { UserRow, Users } from "../types";

const query = (q: string, status: string, cursor?: string | null) => {
  const p = new URLSearchParams({ limit: "50" });
  if (q) p.set("q", q);
  if (status) p.set("status", status);
  if (cursor) p.set("cursor", cursor);
  return `/api/users?${p}`;
};

export function UsersPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A new question starts the list again; typing waits a moment before asking.
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      get<Users>(query(q.trim(), status)).then(
        (page) => {
          if (!current) return;
          setRows(page.users);
          setNext(page.next_cursor);
          setError(null);
        },
        (err) => current && setError(t("common.failed", { reason: err instanceof Error ? err.message : String(err) })),
      );
    }, q ? 250 : 0);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [q, status]);

  async function more() {
    if (busy || !next) return;
    setBusy(true);
    try {
      const page = await get<Users>(query(q.trim(), status, next));
      setRows((prev) => [...(prev ?? []), ...page.users]);
      setNext(page.next_cursor);
    } catch (err) {
      setError(t("common.failed", { reason: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="stack">
      <div class="toolbar">
        <input type="text" class="find" aria-label={t("common.find")} placeholder={t("users.find")} value={q} onInput={(ev) => setQ(ev.currentTarget.value)} />
        <select aria-label={t("users.filter")} value={status} onChange={(ev) => setStatus(ev.currentTarget.value)}>
          <option value="">{t("users.status")}: {t("common.all")}</option>
          <option value="active">{t("users.status.active")}</option>
          <option value="suspended">{t("users.status.suspended")}</option>
        </select>
      </div>
      {error && <p class="bad" role="alert">{error}</p>}
      {!rows ? (
        !error && <Loading />
      ) : !rows.length ? (
        <p class="sentence">{t("users.empty")}</p>
      ) : (
        <>
          <Table label={t("nav.users")} wide>
            <thead>
              <tr>
                <th>{t("users.email")}</th>
                <th>{t("users.status")}</th>
                <th>{t("users.created")}</th>
                <th>{t("users.last_active")}</th>
                <th class="num">{t("users.devices")}</th>
                <th class="num">{t("users.assistants")}</th>
                <th class="num">{t("users.items")}</th>
                <th class="num">{t("users.notes")}</th>
                <th class="num">{t("users.storage")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} data-user={u.id}>
                  <td class="nowrap"><a class="link" href={`/users/${encodeURIComponent(u.id)}`}>{u.email}</a></td>
                  <td class="nowrap">
                    {u.status === "suspended" ? <State dot="danger" bad>{t("users.status.suspended")}</State> : <State dot="solid">{t("users.status.active")}</State>}
                  </td>
                  <td class="nowrap quiet">{dateTime(u.created_at)}</td>
                  <td class="nowrap quiet">{ago(u.last_active_at)}</td>
                  <td class="num">{number(u.devices)}</td>
                  <td class="num">{number(u.assistants)}</td>
                  <td class="num">{number(u.items_live)}</td>
                  <td class="num">{number(u.notes)}</td>
                  <td class="num nowrap">{bytes(u.storage_bytes)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          {next && (
            <div>
              <button class="btn quiet" type="button" disabled={busy} onClick={() => void more()}>
                {t("common.more")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
