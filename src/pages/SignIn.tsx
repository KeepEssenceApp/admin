import { useState } from "preact/hooks";
import { ApiError, post, signedIn } from "../api";
import { Logo } from "../components/ui";
import { t } from "../i18n";

/** One field: the operator's password. The front of the brand is dark. */
export function SignIn() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(ev: Event) {
    ev.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError(null);
    try {
      await post("/api/session", { password });
      signedIn.set(true);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setError(
        status === 429 ? t("signin.locked")
        : status === 401 ? t("signin.wrong")
        : status === 503 ? t("signin.not_set_up")
        : t("common.failed", { reason: err instanceof Error ? err.message : String(err) }),
      );
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="front">
      <form class="front-box" onSubmit={submit}>
        <div class="front-brand">
          <Logo size={44} />
          <img class="front-wordmark" src="/icons/wordmark-white.svg" alt="KeepEssence" width="182" height="30" />
        </div>
        <h1>{t("signin.title")}</h1>
        <label>
          <span class="label">{t("signin.password")}</span>
          <input type="password" name="password" autocomplete="current-password" required autofocus value={password} onInput={(ev) => setPassword(ev.currentTarget.value)} />
        </label>
        <button class="btn" type="submit" disabled={busy || !password}>
          {t("signin.submit")}
        </button>
        {error && <p class="bad" role="alert">{error}</p>}
      </form>
    </main>
  );
}
