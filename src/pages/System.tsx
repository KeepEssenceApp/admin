import { useEffect, useState } from "preact/hooks";
import { get, post } from "../api";
import { Loading, Table } from "../components/ui";
import { dateTime, number, t, tCode } from "../i18n";
import { say } from "../lib";
import type { FetchSystem, FetchTest, ProviderId } from "../types";

const IDS: ProviderId[] = ["direct", "jina", "firecrawl"];
type Draft = { enabled: boolean; endpoint: string; key: string };

/** How saved links are read: the ways, their order, their keys, a test, and how it has gone. */
export function SystemPage() {
  const [data, setData] = useState<FetchSystem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<ProviderId[]>(IDS);
  const [draft, setDraft] = useState<Record<"jina" | "firecrawl", Draft>>({ jina: { enabled: false, endpoint: "", key: "" }, firecrawl: { enabled: false, endpoint: "", key: "" } });
  const [busy, setBusy] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [tested, setTested] = useState<Partial<Record<ProviderId, FetchTest>>>({});

  const take = (v: FetchSystem) => {
    setData(v);
    setOrder(v.order);
    setDraft({ jina: { enabled: v.jina.enabled, endpoint: v.jina.endpoint, key: "" }, firecrawl: { enabled: v.firecrawl.enabled, endpoint: v.firecrawl.endpoint, key: "" } });
  };
  useEffect(() => {
    get<FetchSystem>("/api/fetch").then(take, (err) => setError(t("common.failed", { reason: err instanceof Error ? err.message : String(err) })));
  }, []);
  if (!data) return <Loading error={error} />;

  const move = (id: ProviderId, by: number) => {
    const i = order.indexOf(id);
    const j = i + by;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };
  const dirty =
    order.join() !== data.order.join() ||
    (["jina", "firecrawl"] as const).some((id) => draft[id].enabled !== data[id].enabled || draft[id].endpoint.trim() !== data[id].endpoint || draft[id].key !== "");
  const save = async (ev: Event) => {
    ev.preventDefault();
    setBusy("save");
    setError(null);
    try {
      const body: Record<string, unknown> = { order };
      for (const id of ["jina", "firecrawl"] as const) body[id] = { enabled: draft[id].enabled, endpoint: draft[id].endpoint.trim(), ...(draft[id].key ? { key: draft[id].key } : {}) };
      take(await post<FetchSystem>("/api/fetch", body));
      say(t("system.saved"));
    } catch (err) {
      setError(t("common.failed", { reason: err instanceof Error ? err.message : String(err) }));
    }
    setBusy(null);
  };
  const clearKey = async (id: "jina" | "firecrawl") => {
    setBusy(`clear-${id}`);
    try {
      take(await post<FetchSystem>("/api/fetch", { [id]: { key: "" } }));
      say(t("system.key_cleared"));
    } catch (err) {
      setError(t("common.failed", { reason: err instanceof Error ? err.message : String(err) }));
    }
    setBusy(null);
  };
  const test = async (id: ProviderId) => {
    setBusy(`test-${id}`);
    try {
      const r = await post<FetchTest>("/api/fetch/test", { provider: id, url: url.trim() });
      setTested((x) => ({ ...x, [id]: r }));
    } catch (err) {
      setTested((x) => ({ ...x, [id]: { provider: id, ok: false, chars: 0, ms: 0, error: err instanceof Error ? err.message : String(err), title: "" } }));
    }
    setBusy(null);
  };

  return (
    <div class="stack loose system">
      {error && <p class="bad" role="alert">{error}</p>}
      <form class="stack loose" onSubmit={save} data-testid="system-form">
        <section class="stack">
          <h2>{t("system.ways")}</h2>
          <p class="quiet small">{t("system.ways_hint")}</p>
          <ol class="system-order" data-testid="system-order">
            {order.map((id, i) => (
              <li key={id} class="card stack tight" data-provider={id}>
                <div class="row spread">
                  <b>{i + 1}. {tCode("system.p", id)}</b>
                  <span class="row">
                    <button class="btn quiet small" type="button" disabled={i === 0} aria-label={t("system.earlier")} onClick={() => move(id, -1)}>↑</button>
                    <button class="btn quiet small" type="button" disabled={i === order.length - 1} aria-label={t("system.later")} onClick={() => move(id, 1)}>↓</button>
                  </span>
                </div>
                <p class="quiet small">{tCode("system.about", id)}</p>
                {id !== "direct" && (
                  <div class="stack tight">
                    <label class="row">
                      <input type="checkbox" checked={draft[id].enabled} onChange={(ev) => setDraft({ ...draft, [id]: { ...draft[id], enabled: ev.currentTarget.checked } })} data-testid={`system-${id}-enabled`} />
                      <span>{t("system.enabled")}</span>
                    </label>
                    <label class="stack tight">
                      <span class="label">{t("system.endpoint")}</span>
                      <input type="text" value={draft[id].endpoint} placeholder={t("system.endpoint_default")} onInput={(ev) => setDraft({ ...draft, [id]: { ...draft[id], endpoint: ev.currentTarget.value } })} data-testid={`system-${id}-endpoint`} />
                    </label>
                    <label class="stack tight">
                      <span class="label">{t("system.key")}</span>
                      <input type="password" autocomplete="off" value={draft[id].key} placeholder={data[id].key_set ? t("system.key_kept", { hint: data[id].key_hint || "…" }) : t("system.key_none")} onInput={(ev) => setDraft({ ...draft, [id]: { ...draft[id], key: ev.currentTarget.value } })} data-testid={`system-${id}-key`} />
                    </label>
                    {data[id].key_set && (
                      <div>
                        <button class="btn quiet small" type="button" disabled={busy !== null} onClick={() => void clearKey(id)}>{t("system.key_clear")}</button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
        <div class="row">
          <button class="btn" type="submit" disabled={busy !== null || !dirty} data-testid="system-save">{t("system.save")}</button>
          <span class="quiet small">{t("system.takes_effect")}</span>
        </div>
      </form>

      <section class="stack">
        <h2>{t("system.test")}</h2>
        <p class="quiet small">{t("system.test_hint")}</p>
        <input type="text" value={url} placeholder="https://" aria-label={t("system.test_url")} onInput={(ev) => setUrl(ev.currentTarget.value)} data-testid="system-test-url" />
        <ul class="system-tests" data-testid="system-tests">
          {IDS.map((id) => {
            const now = tested[id];
            const last = data.tests[id];
            return (
              <li key={id} class="row wrap" data-provider={id}>
                <button class="btn quiet small" type="button" disabled={busy !== null || !/^https?:\/\/\S+\.\S+/.test(url.trim())} onClick={() => void test(id)}>
                  {t("system.test_with", { name: tCode("system.p", id) })}
                </button>
                {now ? (
                  <span class={now.ok ? "" : "bad"} data-testid={`system-result-${id}`}>
                    {now.ok ? t("system.test_ok", { chars: number(now.chars), ms: number(now.ms), title: now.title || "—" }) : t("system.test_bad", { reason: now.error })}
                  </span>
                ) : last ? (
                  <span class="quiet small">
                    {t(last.ok ? "system.last_ok" : "system.last_bad", { when: dateTime(last.at), host: last.url_host, chars: number(last.chars), reason: last.error })}
                  </span>
                ) : (
                  <span class="quiet small">{t("system.never_tested")}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section class="stack">
        <h2>{t("system.stats", { days: data.stats.days })}</h2>
        {!data.stats.rows.length ? (
          <p class="sentence">{t("system.stats_empty")}</p>
        ) : (
          <Table label={t("system.stats", { days: data.stats.days })}>
            <thead>
              <tr>
                <th>{t("system.platform")}</th>
                <th>{t("system.path")}</th>
                <th class="num">{t("system.links")}</th>
              </tr>
            </thead>
            <tbody data-testid="system-stats">
              {data.stats.rows.map((r) => (
                <tr key={`${r.platform}/${r.path}`}>
                  <td>{tCode("system.platform", r.platform)}</td>
                  <td class={r.path === "none" ? "bad" : ""}>{tCode("system.p", r.path)}</td>
                  <td class="num">{number(r.n)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p class="quiet small">{t("system.stats_hint")}</p>
      </section>
    </div>
  );
}
