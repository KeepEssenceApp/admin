import { useState } from "preact/hooks";
import { get } from "../api";
import { Loading, Segments, Table } from "../components/ui";
import { number, t } from "../i18n";
import { useLoad } from "../lib";
import type { Usage } from "../types";

const CHOICES = [7, 30, 90];

export function UsagePage() {
  const [days, setDays] = useState(30);
  const { data, error } = useLoad(() => get<Usage>(`/api/usage?days=${days}`), [days]);
  const most = Math.max(1, ...(data?.days ?? []).map((d) => d.input_tokens + d.output_tokens));

  return (
    <div class="stack loose">
      <Segments label={t("usage.pick")} value={days} options={CHOICES.map((n) => ({ value: n, label: t("usage.days", { n }) }))} onChange={setDays} />
      {!data ? (
        <Loading error={error} />
      ) : (
        <>
          <section class="stack">
            <h2>{t("usage.by_day")}</h2>
            {!data.days.length ? (
              <p class="sentence">{t("usage.empty")}</p>
            ) : (
              <Table label={t("usage.by_day")}>
                <thead>
                  <tr>
                    <th>{t("usage.day")}</th>
                    <th class="num">{t("usage.calls")}</th>
                    <th class="num">{t("usage.input")}</th>
                    <th class="num">{t("usage.output")}</th>
                    <th class="num">{t("usage.items")}</th>
                    <th class="bar-col">{t("usage.bar")}</th>
                  </tr>
                </thead>
                <tbody data-testid="usage-days">
                  {data.days.map((d) => (
                    <tr key={d.day}>
                      <td class="nowrap">{d.day}</td>
                      <td class="num">{number(d.calls)}</td>
                      <td class="num">{number(d.input_tokens)}</td>
                      <td class="num">{number(d.output_tokens)}</td>
                      <td class="num">{number(d.items)}</td>
                      <td class="bar-col">
                        <div class="bar" aria-hidden="true">
                          <div style={{ width: `${Math.round(((d.input_tokens + d.output_tokens) / most) * 100)}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </section>

          <section class="stack">
            <h2>{t("usage.top")}</h2>
            {!data.top_users.length ? (
              <p class="sentence">{t("usage.empty")}</p>
            ) : (
              <Table label={t("usage.top")}>
                <thead>
                  <tr>
                    <th>{t("usage.account")}</th>
                    <th class="num">{t("usage.calls")}</th>
                    <th class="num">{t("usage.input")}</th>
                    <th class="num">{t("usage.output")}</th>
                  </tr>
                </thead>
                <tbody data-testid="usage-top">
                  {data.top_users.map((u) => (
                    <tr key={u.user_id}>
                      <td class="nowrap"><a class="link" href={`/users/${encodeURIComponent(u.user_id)}`}>{u.email}</a></td>
                      <td class="num">{number(u.calls)}</td>
                      <td class="num">{number(u.input_tokens)}</td>
                      <td class="num">{number(u.output_tokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
