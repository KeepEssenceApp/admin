import { useMemo, useState } from "preact/hooks";
import { get, post } from "../api";
import { Loading, State, Table, type DotKind } from "../components/ui";
import { dateTime, label, labels, t } from "../i18n";
import { say, sayError, useLoad } from "../lib";
import { inviteNote } from "../shared/waitlist";
import type { InviteResult, SignupRow, SignupStatus, Waitlist } from "../types";

const DOT: Record<SignupStatus, DotKind> = { new: "ring", invited: "solid", joined: "solid" };

/** Everything a row shows, as one lower-case text to look in. */
const haystack = (r: SignupRow) =>
  [r.email, label("lang", r.lang), labels("storage", r.storage, r.storage_other), labels("sources", r.sources, r.sources_other), label("assistant", r.assistant), label("mode", r.mode), r.note]
    .join(" ").toLowerCase();

export function WaitlistPage() {
  const { data, error, reload } = useLoad(() => get<Waitlist>("/api/waitlist"), []);
  const [status, setStatus] = useState<"" | SignupStatus>("");
  const [lang, setLang] = useState("");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const rows = data?.rows ?? [];
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => (!status || r.status === status) && (!lang || r.lang === lang) && (!needle || haystack(r).includes(needle)));
  }, [rows, status, lang, q]);
  if (!data) return <Loading error={error} />;

  const count = (s: SignupStatus) => rows.filter((r) => r.status === s).length;
  const selectable = shown.filter((r) => r.status === "new").map((r) => r.email);
  const chosen = selectable.filter((email) => picked.has(email));
  const toggle = (email: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(email);
      else next.delete(email);
      return next;
    });

  async function invite(emails: string[]) {
    if (busy || !emails.length) return;
    setBusy(true);
    try {
      const result = await post<InviteResult>("/api/waitlist/invite", { emails });
      const note = inviteNote(emails, result);
      say(t(note.key, note.vars), note.bad);
      setPicked(new Set());
      reload();
    } catch (err) {
      sayError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="stack">
      <p class="quiet" data-testid="waitlist-summary">{t("waitlist.summary", { n: rows.length, a: count("new"), b: count("invited"), c: count("joined") })}</p>
      <div class="toolbar">
        <select aria-label={t("waitlist.filter.status")} value={status} onChange={(ev) => setStatus(ev.currentTarget.value as "" | SignupStatus)}>
          <option value="">{t("waitlist.status")}: {t("common.all")}</option>
          <option value="new">{t("waitlist.status.new")}</option>
          <option value="invited">{t("waitlist.status.invited")}</option>
          <option value="joined">{t("waitlist.status.joined")}</option>
        </select>
        <select aria-label={t("waitlist.filter.lang")} value={lang} onChange={(ev) => setLang(ev.currentTarget.value)}>
          <option value="">{t("waitlist.lang")}: {t("common.all")}</option>
          <option value="zh-Hans">{t("waitlist.lang.zh")}</option>
          <option value="en">{t("waitlist.lang.en")}</option>
        </select>
        <input type="text" class="find" aria-label={t("common.find")} placeholder={t("waitlist.find")} value={q} onInput={(ev) => setQ(ev.currentTarget.value)} />
        <button class="btn" type="button" disabled={busy || !chosen.length} onClick={() => void invite(chosen)} data-testid="invite-selected">
          {t("waitlist.invite_selected", { n: chosen.length })}
        </button>
        <a class="btn quiet" href="/api/waitlist.csv" download="keepessence-enrolled.csv">
          {t("waitlist.download")}
        </a>
      </div>

      {!rows.length ? (
        <p class="sentence">{t("waitlist.empty")}</p>
      ) : !shown.length ? (
        <p class="sentence">{t("waitlist.none_match")}</p>
      ) : (
        <Table label={t("nav.waitlist")} wide>
          <thead>
            <tr>
              <th class="tick">
                <input
                  type="checkbox"
                  aria-label={t("waitlist.select_all")}
                  disabled={!selectable.length}
                  checked={selectable.length > 0 && chosen.length === selectable.length}
                  onChange={(ev) => setPicked(ev.currentTarget.checked ? new Set(selectable) : new Set())}
                />
              </th>
              <th>{t("waitlist.email")}</th>
              <th>{t("waitlist.status")}</th>
              <th>{t("waitlist.created")}</th>
              <th>{t("waitlist.lang")}</th>
              <th>{t("waitlist.storage")}</th>
              <th>{t("waitlist.sources")}</th>
              <th>{t("waitlist.assistant")}</th>
              <th>{t("waitlist.mode")}</th>
              <th>{t("waitlist.note")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} data-email={r.email} data-status={r.status}>
                <td class="tick">
                  {r.status === "new" && (
                    <input type="checkbox" aria-label={t("waitlist.select_one", { email: r.email })} checked={picked.has(r.email)} onChange={(ev) => toggle(r.email, ev.currentTarget.checked)} />
                  )}
                </td>
                <td class="nowrap">{r.user_id ? <a class="link" href={`/users/${encodeURIComponent(r.user_id)}`}>{r.email}</a> : r.email}</td>
                <td class="nowrap">
                  <State dot={DOT[r.status]}>{t(`waitlist.status.${r.status}`)}</State>
                  {r.status === "new" && (
                    <button class="btn quiet small row-action" type="button" disabled={busy} onClick={() => void invite([r.email])}>
                      {t("waitlist.invite")}
                    </button>
                  )}
                </td>
                <td class="nowrap quiet">{dateTime(r.created_at)}</td>
                <td class="nowrap">{label("lang", r.lang)}</td>
                <td class="list">{labels("storage", r.storage, r.storage_other)}</td>
                <td class="list">{labels("sources", r.sources, r.sources_other)}</td>
                <td class="nowrap">{label("assistant", r.assistant)}</td>
                <td class="nowrap">{label("mode", r.mode)}</td>
                <td class="note">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
