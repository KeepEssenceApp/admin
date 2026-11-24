import { useState } from "preact/hooks";
import { ApiError, del, get, post } from "../api";
import { Loading, Sheet, State, Table } from "../components/ui";
import { clock, dateTime, t } from "../i18n";
import { say, sayError, useLoad } from "../lib";
import type { InviteResult, Invites, LoginCode } from "../types";

/** The code is held only while this panel is open. */
function CodePanel({ email, code, onClose }: { email: string; code: LoginCode; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code.code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <Sheet title={t("invites.code_title", { email })} onClose={onClose}>
      <p class="code" data-testid="login-code">{code.code}</p>
      <div class="row wrap">
        <button class="btn" type="button" onClick={() => void copy()}>
          {t("common.copy")}
        </button>
        {copied && <span role="status">{t("common.copied")}</span>}
      </div>
      <p>{t("invites.code_order")}</p>
      <p class="quiet">
        {t("invites.code_expires", { time: clock(code.expires_at) })} {t("invites.code_once")}
      </p>
    </Sheet>
  );
}

export function InvitesPage() {
  const { data, error, reload } = useLoad(() => get<Invites>("/api/invites"), []);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [code, setCode] = useState<{ email: string; code: LoginCode } | null>(null);

  async function add(ev: Event) {
    ev.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true);
    try {
      const result = await post<InviteResult>("/api/invites", { text });
      say(t("invites.add_done", { added: result.added.length, already: result.already.length, invalid: result.invalid.length }));
      setInvalid(result.invalid);
      // What could not be added stays in the box to be corrected.
      setText(result.invalid.join("\n"));
      reload();
    } catch (err) {
      sayError(err);
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(email: string) {
    if (busy) return;
    setBusy(true);
    try {
      await del("/api/invites", { email });
      say(t("invites.withdrawn", { email }));
      reload();
    } catch (err) {
      sayError(err);
    } finally {
      setBusy(false);
    }
  }

  async function getCode(email: string) {
    if (busy) return;
    setBusy(true);
    try {
      setCode({ email, code: await post<LoginCode>("/api/login-codes", { email }) });
    } catch (err) {
      const known = err instanceof ApiError && (err.code === "not_invited" ? t("invites.err.not_invited") : err.status === 409 ? t("invites.err.suspended") : null);
      if (known) say(known, true);
      else sayError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="stack loose">
      <form class="stack add" onSubmit={add}>
        <label>
          <span class="label">{t("invites.add")}</span>
          <textarea name="emails" rows={3} value={text} onInput={(ev) => setText(ev.currentTarget.value)} spellcheck={false} autocapitalize="off" />
        </label>
        <p class="quiet small">{t("invites.add_hint")}</p>
        {invalid.length > 0 && <p class="bad" data-testid="invalid-list">{t("invites.add_invalid", { list: invalid.join(", ") })}</p>}
        <div>
          <button class="btn" type="submit" disabled={busy || !text.trim()}>
            {t("invites.add_submit")}
          </button>
        </div>
      </form>

      {!data ? (
        <Loading error={error} />
      ) : (
        <section class="stack">
          <p class="quiet" data-testid="mail-note">{data.mail_configured ? t("invites.mail_on") : t("invites.mail_off")}</p>
          {!data.invites.length ? (
            <p class="sentence">{t("invites.empty")}</p>
          ) : (
            <Table label={t("nav.invites")}>
              <thead>
                <tr>
                  <th>{t("invites.email")}</th>
                  <th>{t("invites.invited")}</th>
                  <th>{t("invites.joined")}</th>
                  <th>{t("invites.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {data.invites.map((i) => (
                  <tr key={i.email} data-email={i.email}>
                    <td class="nowrap">{i.user_id ? <a class="link" href={`/users/${encodeURIComponent(i.user_id)}`}>{i.email}</a> : i.email}</td>
                    <td class="nowrap quiet">{dateTime(i.invited_at)}</td>
                    <td class="nowrap">{i.joined_at ? <State dot="solid">{dateTime(i.joined_at)}</State> : <State dot="ring">{t("invites.not_joined")}</State>}</td>
                    <td class="nowrap">
                      <span class="row">
                        {!data.mail_configured && (
                          <button class="btn quiet small" type="button" disabled={busy} onClick={() => void getCode(i.email)}>
                            {t("invites.code")}
                          </button>
                        )}
                        {!i.joined_at && !i.user_id && (
                          <button class="btn quiet small" type="button" disabled={busy} onClick={() => void withdraw(i.email)}>
                            {t("invites.withdraw")}
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>
      )}
      {code && <CodePanel email={code.email} code={code.code} onClose={() => setCode(null)} />}
    </div>
  );
}
