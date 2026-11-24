import { useState } from "preact/hooks";
import { ApiError, del, get, post } from "../api";
import { Loading, Sheet, State, Table } from "../components/ui";
import { ago, bytes, dateTime, number, t, tCode } from "../i18n";
import { say, sayError, useLoad } from "../lib";
import { go } from "../router";
import type { Device, UserDetail } from "../types";

/** Deleting cannot be undone: the button stays off until the account's email is typed. */
function DeleteDialog({ user, onClose, onDone }: { user: UserDetail; onClose: () => void; onDone: () => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim().toLowerCase() === user.email.toLowerCase();

  async function submit(ev: Event) {
    ev.preventDefault();
    if (!matches || busy) return;
    setBusy(true);
    try {
      await del(`/api/users/${encodeURIComponent(user.id)}`, { confirm_email: typed.trim() });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 400 ? t("user.delete.mismatch") : t("common.failed", { reason: err instanceof Error ? err.message : String(err) }));
      setBusy(false);
    }
  }

  return (
    <Sheet title={t("user.delete")} onClose={onClose}>
      <form class="stack" onSubmit={submit}>
        <p>{t("user.delete.body")}</p>
        <label>
          <span class="label">{t("user.delete.confirm", { email: user.email })}</span>
          <input type="text" name="confirm_email" autocomplete="off" autocapitalize="off" spellcheck={false} autofocus value={typed} onInput={(ev) => setTyped(ev.currentTarget.value)} />
        </label>
        {error && <p class="bad" role="alert">{error}</p>}
        <div class="row">
          <button class="btn danger" type="submit" disabled={!matches || busy} data-testid="confirm-delete">
            {t("user.delete")}
          </button>
          <button class="btn quiet" type="button" onClick={onClose}>
            {t("common.cancel")}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export function UserPage({ id }: { id: string }) {
  const path = `/api/users/${encodeURIComponent(id)}`;
  const { data: user, error, reload } = useLoad(() => get<UserDetail>(path), [id]);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!user) {
    return (
      <div class="stack">
        <a class="back link" href="/users">{t("user.back")}</a>
        <Loading error={error} />
      </div>
    );
  }

  /** Runs one action, says what happened in one sentence, and reads the account again. */
  async function act<T>(run: () => Promise<T>, sentence: (result: T) => string) {
    if (busy) return;
    setBusy(true);
    try {
      say(sentence(await run()));
      reload();
    } catch (err) {
      sayError(err);
    } finally {
      setBusy(false);
    }
  }
  const email = user.email;
  const suspended = user.status === "suspended";
  const revoke = (d: Device) => act(() => del(`${path}/devices/${encodeURIComponent(d.id)}`), () => t("user.done.revoked", { name: d.name }));

  return (
    <div class="stack loose">
      <header class="stack tight">
        <a class="back link" href="/users">{t("user.back")}</a>
        <h2 class="who" data-testid="user-email">{email}</h2>
        <p data-testid="user-status">
          {suspended ? <State dot="danger" bad>{t("users.status.suspended")}</State> : <State dot="solid">{t("users.status.active")}</State>}
        </p>
        <p class="quiet">
          {t("user.joined", { date: dateTime(user.created_at) })} · {t("user.last_active", { when: ago(user.last_active_at) })}
          {user.suspended_at && <> · {t("user.suspended_at", { date: dateTime(user.suspended_at) })}</>}
        </p>
        <p class="quiet">
          {t("user.summary", { items: number(user.items_live), notes: number(user.notes), storage: bytes(user.storage_bytes) })} · {user.lang} · {user.timezone}
        </p>
      </header>

      <section class="actions" aria-label={t("user.actions")}>
        {suspended ? (
          <button class="btn quiet" type="button" disabled={busy} onClick={() => void act(() => post(`${path}/restore`), () => t("user.done.restored", { email }))}>
            {t("user.restore")}
          </button>
        ) : (
          <button class="btn quiet danger" type="button" disabled={busy} onClick={() => void act(() => post(`${path}/suspend`), () => t("user.done.suspended", { email }))}>
            {t("user.suspend")}
          </button>
        )}
        <button
          class="btn quiet"
          type="button"
          disabled={busy || !user.devices.length}
          onClick={() => void act(() => post<{ revoked: number }>(`${path}/sign-out`), (r) => t("user.done.signed_out", { email, n: r.revoked }))}
        >
          {t("user.sign_out")}
        </button>
        <button class="btn danger" type="button" disabled={busy} onClick={() => setDeleting(true)}>
          {t("user.delete")}
        </button>
      </section>

      <section class="stack">
        <h3>{t("user.devices")}</h3>
        {!user.devices.length ? (
          <p class="quiet" data-testid="no-devices">{t("user.no_devices")}</p>
        ) : (
          <Table label={t("user.devices")}>
            <thead>
              <tr>
                <th>{t("user.device.name")}</th>
                <th>{t("user.device.client")}</th>
                <th>{t("user.device.tier")}</th>
                <th>{t("user.device.last_used")}</th>
                <th>{t("user.device.notifications")}</th>
                <th>{t("user.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {user.devices.map((d) => (
                <tr key={d.id} data-device={d.id}>
                  <td>{d.name}</td>
                  <td>{d.client}</td>
                  <td class="nowrap">{tCode("user.tier", d.tier === "save_only" ? "save" : d.tier)}</td>
                  <td class="nowrap quiet">{ago(d.last_used_at)}</td>
                  <td>{d.notifications ? t("common.yes") : t("common.no")}</td>
                  <td>
                    <button class="btn quiet small" type="button" disabled={busy} onClick={() => void revoke(d)}>
                      {t("user.revoke")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section class="stack">
        <h3>{t("user.assistants")}</h3>
        {!user.assistants.length ? (
          <p class="quiet">{t("user.no_assistants")}</p>
        ) : (
          <Table label={t("user.assistants")}>
            <thead>
              <tr>
                <th>{t("user.assistant.name")}</th>
                <th>{t("user.assistant.kind")}</th>
                <th>{t("user.assistant.steps")}</th>
                <th>{t("user.assistant.last_seen")}</th>
              </tr>
            </thead>
            <tbody>
              {user.assistants.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.name}
                    {a.built_in && <span class="quiet"> · {t("user.built_in")}</span>}
                  </td>
                  <td class="nowrap">{tCode("user.kind", a.kind)}</td>
                  <td>{a.steps.map((s) => tCode("user.step", s)).join(" · ")}</td>
                  <td class="nowrap quiet">{ago(a.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section class="stack">
        <h3>{t("user.usage")}</h3>
        <Table label={t("user.usage")}>
          <thead>
            <tr>
              <th>{t("user.usage.name")}</th>
              <th class="num">{t("usage.calls")}</th>
              <th class="num">{t("usage.input")}</th>
              <th class="num">{t("usage.output")}</th>
              <th class="num">{t("user.usage.items")}</th>
            </tr>
          </thead>
          <tbody>
            {user.usage.map((u) => (
              <tr key={u.assistant_id}>
                <td>
                  {u.name}
                  {u.built_in && <span class="quiet"> · {t("user.built_in")}</span>}
                </td>
                <td class="num">{number(u.calls)}</td>
                <td class="num">{number(u.input_tokens)}</td>
                <td class="num">{number(u.output_tokens)}</td>
                <td class="num">{number(u.items)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>

      <section class="stack">
        <h3>{t("user.days")}</h3>
        <Table label={t("user.days")}>
          <thead>
            <tr>
              <th>{t("user.day")}</th>
              <th class="num">{t("user.day.saved")}</th>
              <th class="num">{t("user.day.analysed")}</th>
              <th class="num">{t("user.day.digests")}</th>
              <th class="num">{t("user.day.notes")}</th>
            </tr>
          </thead>
          <tbody data-testid="user-days">
            {user.days.map((d) => (
              <tr key={d.day}>
                <td class="nowrap">{d.day}</td>
                <td class="num">{number(d.saved)}</td>
                <td class="num">{number(d.analysed)}</td>
                <td class="num">{number(d.digests)}</td>
                <td class="num">{number(d.notes)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>

      {deleting && (
        <DeleteDialog
          user={user}
          onClose={() => setDeleting(false)}
          onDone={() => {
            go("/users");
            say(t("user.done.deleted", { email }));
          }}
        />
      )}
    </div>
  );
}
