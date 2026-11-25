import { useEffect, useState } from "preact/hooks";
import { get } from "../api";
import { Loading } from "../components/ui";
import { dateTime, t, tCode } from "../i18n";
import type { Feedback, FeedbackEntry } from "../types";

/** What users wrote to the operator from inside the app, newest first. */
export function FeedbackPage() {
  const [entries, setEntries] = useState<FeedbackEntry[] | null>(null);
  const [forwarding, setForwarding] = useState<string | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(cursor?: string | null) {
    setBusy(true);
    try {
      const page = await get<Feedback>(`/api/feedback?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      setEntries((prev) => (cursor ? [...(prev ?? []), ...page.feedback] : page.feedback));
      setForwarding(page.forwarding);
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
  return (
    <div class="stack">
      {error && <p class="bad" role="alert">{error}</p>}
      <p class="quiet small" data-testid="feedback-forwarding">
        {forwarding ? t("feedback.forwarding", { repo: forwarding }) : t("feedback.not_forwarding")}
      </p>
      {!entries.length && <p class="sentence">{t("feedback.empty")}</p>}
      <ul class="feedback-list" data-testid="feedback-rows">
        {entries.map((e) => (
          <li key={e.id} class="card stack tight">
            <p class="quiet small">
              <a class="link" href={`/users/${encodeURIComponent(e.user_id)}`}>{e.email}</a>
              {" · "}
              {dateTime(e.at)}
              {" · "}
              {tCode("feedback.where", e.where)}
            </p>
            {e.doing && (
              <p>
                <span class="label">{t("feedback.doing")}</span>
                <span class="break pre">{e.doing}</span>
              </p>
            )}
            <p>
              <span class="label">{t("feedback.wrong")}</span>
              <span class="break pre">{e.wrong}</span>
            </p>
            {e.wish && (
              <p>
                <span class="label">{t("feedback.wish")}</span>
                <span class="break pre">{e.wish}</span>
              </p>
            )}
            <p class="quiet small">
              {e.issue_url ? (
                <a class="link" href={e.issue_url} target="_blank" rel="noopener noreferrer">{t("feedback.issue")}</a>
              ) : e.forward_error ? (
                <span class="bad">{t("feedback.not_filed", { reason: e.forward_error })}</span>
              ) : (
                t("feedback.only_here")
              )}
            </p>
          </li>
        ))}
      </ul>
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
