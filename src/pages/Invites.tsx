import { useState } from "preact/hooks";
import { ApiError, del, get, post } from "../api";
import { Loading, Sheet, State, Table } from "../components/ui";
import { clock, dateTime, t, type Key } from "../i18n";
import { say, sayError, useLoad } from "../lib";
import type { Invite, InviteResult, Invites, LoginCode } from "../types";

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

const FAILED_REASONS = ["refused", "error", "unconfirmed"];
const MAIL_STATES = ["queued", "sending", "accepted", "not_sent"];

/**
 * The invitation notice as the core reports it. "Accepted" is the mail service taking it, not delivery.
 * A failure is told apart by its fixed reason (spec product/mail.md): a refusal and a mail that was never
 * sent can be fixed and invited again; an unconfirmed one may have gone out, so no "invite again" advice and
 * the second-mail risk is written on the row. A failure with a reason this portal does not know counts as
 * unconfirmed: what cannot be told apart is not shown as a certain failure.
 */
function MailCell({ mail }: { mail: Invite["mail"] }) {
  if (!mail) return <span class="quiet" data-testid="mail-state" data-state="none">{t("invites.mail.none")}</span>;
  const when = mail.at ? <span class="quiet small">{dateTime(mail.at)}</span> : null;
  if (mail.state === "failed") {
    const reason = FAILED_REASONS.includes(mail.reason ?? "") ? (mail.reason as string) : "unconfirmed";
    return (
      <span class="stack tight" data-testid="mail-state" data-state="failed" data-reason={reason}>
        <State dot="danger" bad>{t(`invites.mail.failed.${reason}` as Key)}</State>
        <span class="quiet small">{reason === "unconfirmed" ? t("invites.mail.second") : t("invites.mail.fix_again")}</span>
        {when}
      </span>
    );
  }
  if (!MAIL_STATES.includes(mail.state)) return <span data-testid="mail-state" data-state="other">{t("invites.mail.other", { state: mail.state })}</span>;
  return (
    <span class="stack tight" data-testid="mail-state" data-state={mail.state}>
      <State dot={mail.state === "accepted" ? "solid" : "ring"}>{t(`invites.mail.${mail.state}` as Key)}</State>
      {when}
    </span>
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
                  <th>{t("invites.mail")}</th>
                  <th>{t("invites.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {data.invites.map((i) => (
                  <tr key={i.email} data-email={i.email}>
                    <td class="nowrap">{i.user_id ? <a class="link" href={`/users/${encodeURIComponent(i.user_id)}`}>{i.email}</a> : i.email}</td>
                    <td class="nowrap quiet">{dateTime(i.invited_at)}</td>
                    <td class="nowrap">{i.joined_at ? <State dot="solid">{dateTime(i.joined_at)}</State> : <State dot="ring">{t("invites.not_joined")}</State>}</td>
                    <td><MailCell mail={i.mail} /></td>
                    <td class="nowrap">
                      <span class="row">
                        <button class="btn quiet small" type="button" disabled={busy} onClick={() => void getCode(i.email)}>
                          {t("invites.code")}
                        </button>
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
