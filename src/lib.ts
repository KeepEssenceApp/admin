import { useEffect, useState } from "preact/hooks";
import { createStore } from "./store";
import { t } from "./i18n";

/** The one sentence shown after an action. It stays until the next action or page. */
export interface Said {
  text: string;
  bad?: boolean;
}
export const said = createStore<Said | null>(null);
export const say = (text: string, bad = false) => said.set({ text, bad });
export const sayError = (err: unknown) => say(t("common.failed", { reason: err instanceof Error ? err.message : String(err) }), true);

/** Loads something when the page opens and again whenever `deps` change or reload() is called. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let current = true;
    setError(null);
    load().then(
      (value) => current && setData(value),
      (err) => current && setError(t("common.failed", { reason: err instanceof Error ? err.message : String(err) })),
    );
    return () => {
      current = false;
    };
  }, [...deps, n]);
  return { data, error, setData, reload: () => setN((x) => x + 1) };
}
