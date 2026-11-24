import { get } from "../api";
import { Loading, State, Table } from "../components/ui";
import { ago, number, t } from "../i18n";
import { useLoad } from "../lib";
import type { Overview } from "../types";

/** The minute job counts as late when it has not run for more than this. */
const LATE_MS = 10 * 60 * 1000;

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <>
      <span class="stat-value">{number(value)}</span>
      <span class="stat-label">{label}</span>
    </>
  );
  return href ? <a class="stat" href={href}>{body}</a> : <div class="stat">{body}</div>;
}

const Configured = ({ on }: { on: boolean }) => <State dot={on ? "solid" : "ring"}>{on ? t("overview.configured") : t("overview.not_configured")}</State>;

export function OverviewPage() {
  const { data, error } = useLoad(() => get<Overview>("/api/overview"), []);
  if (!data) return <Loading error={error} />;
  const { core, waitlist } = data;
  const minute = core.cron.minute_ran_at;
  const late = !minute || Date.now() - new Date(minute).getTime() > LATE_MS;
  const blank = t("common.blank");

  return (
    <div class="stack loose">
      <section>
        <h2>{t("overview.waitlist")}</h2>
        <div class="stats" data-testid="waitlist-counts">
          <Stat label={t("overview.signups")} value={waitlist.signups} href="/waitlist" />
          <Stat label={t("overview.invited")} value={waitlist.invited} />
          <Stat label={t("overview.joined")} value={waitlist.joined} />
        </div>
      </section>

      <section>
        <h2>{t("overview.accounts")}</h2>
        <div class="stats" data-testid="account-counts">
          <Stat label={t("overview.users")} value={core.users.total} href="/users" />
          <Stat label={t("overview.active_7d")} value={core.users.active_7d} />
          <Stat label={t("overview.suspended")} value={core.users.suspended} />
          <Stat label={t("overview.invites_total")} value={core.invites.total} href="/invites" />
          <Stat label={t("overview.invites_pending")} value={core.invites.pending} />
        </div>
      </section>

      <section>
        <h2>{t("overview.counts")}</h2>
        <Table label={t("overview.counts")}>
          <thead>
            <tr>
              <th>{t("overview.what")}</th>
              <th class="num">{t("overview.today")}</th>
              <th class="num">{t("overview.last_7d")}</th>
              <th class="num">{t("overview.now")}</th>
            </tr>
          </thead>
          <tbody>
            <tr><th scope="row">{t("overview.saved")}</th><td class="num">{number(core.items.today)}</td><td class="num">{number(core.items.last_7d)}</td><td class="num">{number(core.items.live)}</td></tr>
            <tr><th scope="row">{t("overview.analyses")}</th><td class="num">{number(core.analyses.today)}</td><td class="num">{number(core.analyses.last_7d)}</td><td class="num quiet">{blank}</td></tr>
            <tr><th scope="row">{t("overview.digests")}</th><td class="num quiet">{blank}</td><td class="num">{number(core.digests.last_7d)}</td><td class="num quiet">{blank}</td></tr>
            <tr><th scope="row">{t("overview.notes")}</th><td class="num quiet">{blank}</td><td class="num quiet">{blank}</td><td class="num">{number(core.notes.total)}</td></tr>
          </tbody>
        </Table>
        <p class="quiet small">{t("overview.today_note")}</p>
      </section>

      <section>
        <h2>{t("overview.waiting")}</h2>
        <div class="stats">
          <Stat label={t("overview.triage")} value={core.waiting.triage} />
          <Stat label={t("overview.analysis")} value={core.waiting.analysis} />
        </div>
      </section>

      <section>
        <h2>{t("overview.usage")}</h2>
        <Table label={t("overview.usage")}>
          <thead>
            <tr>
              <th>{t("overview.what")}</th>
              <th class="num">{t("overview.today")}</th>
              <th class="num">{t("overview.last_7d")}</th>
            </tr>
          </thead>
          <tbody>
            <tr><th scope="row">{t("overview.calls")}</th><td class="num">{number(core.usage.today.calls)}</td><td class="num">{number(core.usage.last_7d.calls)}</td></tr>
            <tr><th scope="row">{t("overview.input")}</th><td class="num">{number(core.usage.today.input_tokens)}</td><td class="num">{number(core.usage.last_7d.input_tokens)}</td></tr>
            <tr><th scope="row">{t("overview.output")}</th><td class="num">{number(core.usage.today.output_tokens)}</td><td class="num">{number(core.usage.last_7d.output_tokens)}</td></tr>
          </tbody>
        </Table>
      </section>

      <section>
        <h2>{t("overview.cron")}</h2>
        <dl class="facts">
          <div data-testid="cron-minute">
            <dt>{t("overview.cron_minute")}</dt>
            <dd>
              <State dot={late ? "danger" : "solid"} bad={late}>
                {minute ? t("overview.cron_ran", { when: ago(minute) }) : t("overview.cron_never")}
              </State>
            </dd>
          </div>
          <div data-testid="cron-hourly">
            <dt>{t("overview.cron_hourly")}</dt>
            <dd>
              <State dot={core.cron.hourly_ran_at ? "solid" : "ring"}>
                {core.cron.hourly_ran_at ? t("overview.cron_ran", { when: ago(core.cron.hourly_ran_at) }) : t("overview.cron_never")}
              </State>
            </dd>
          </div>
        </dl>
        {late && <p class="bad" role="alert">{t("overview.cron_late")}</p>}
      </section>

      <section>
        <h2>{t("overview.config")}</h2>
        <dl class="facts" data-testid="config">
          <div data-config="model"><dt>{t("overview.model")}</dt><dd><Configured on={core.config.model_configured} /> <span class="quiet">{core.config.model}</span></dd></div>
          <div data-config="mail"><dt>{t("overview.mail")}</dt><dd><Configured on={core.config.mail_configured} /></dd></div>
          <div data-config="push"><dt>{t("overview.push")}</dt><dd><Configured on={core.config.push_configured} /></dd></div>
          <div data-config="version"><dt>{t("overview.version")}</dt><dd>{core.config.version}</dd></div>
        </dl>
      </section>
    </div>
  );
}
