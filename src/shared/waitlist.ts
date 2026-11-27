// The beta sign-up list, joined with the core's invitations.

export interface Signup {
  id: number;
  email: string;
  lang: string;
  storage: string;
  storage_other: string;
  sources: string;
  sources_other: string;
  assistant: string;
  mode: string;
  note: string;
  created_at: string;
  invited_at: string | null;
}

/**
 * The invitation notice mail, as the core reports it (spec product/mail.md). `reason` is a fixed machine
 * value (failed: refused, error or unconfirmed; not_sent: no_mail_service), never a provider's words.
 */
export interface InviteMail {
  state: string;
  at: string | null;
  reason: string | null;
}

export interface Invite {
  email: string;
  invited_at: string;
  joined_at: string | null;
  user_id: string | null;
  /** The language the notice mail was asked for in. Absent or null from a core that predates the mail. */
  lang?: "zh" | "en" | null;
  /** Null: an invitation from before the notice mail existed. Absent: a core that predates it. */
  mail?: InviteMail | null;
}

/**
 * The language of each person's notice mail: the page they signed up from. The sign-up form records
 * `zh-Hans` or `en`; the core names `zh` and `en`. A language that is neither is left out, and the core
 * then uses its default. With several rows for one email the newest (the first, they come newest first) wins.
 */
export function mailLanguages(signups: Pick<Signup, "email" | "lang">[], emails: string[]): Record<string, "zh" | "en"> {
  const wanted = new Set(emails.map((e) => e.trim().toLowerCase()));
  const out: Record<string, "zh" | "en"> = {};
  for (const s of signups) {
    const email = s.email.trim().toLowerCase();
    if (!wanted.has(email) || email in out) continue;
    const lang = s.lang.trim().toLowerCase();
    if (lang === "zh" || lang.startsWith("zh-")) out[email] = "zh";
    else if (lang === "en" || lang.startsWith("en-")) out[email] = "en";
  }
  return out;
}

export type SignupStatus = "new" | "invited" | "joined";
export interface SignupRow extends Signup {
  status: SignupStatus;
  joined_at: string | null;
  user_id: string | null;
}

/**
 * The status of each sign-up comes from the core's invitation list, matched by email:
 * an account exists → joined; on the list → invited; otherwise new. `invited_at` in the
 * sign-up row is a note of when; it does not decide the status.
 */
export function joinStatus(signups: Signup[], invites: Invite[]): SignupRow[] {
  const byEmail = new Map(invites.map((i) => [i.email.trim().toLowerCase(), i]));
  return signups.map((s) => {
    const invite = byEmail.get(s.email.trim().toLowerCase());
    const status: SignupStatus = invite ? (invite.joined_at || invite.user_id ? "joined" : "invited") : "new";
    return {
      ...s,
      status,
      invited_at: s.invited_at ?? invite?.invited_at ?? null,
      joined_at: invite?.joined_at ?? null,
      user_id: invite?.user_id ?? null,
    };
  });
}

/** Sign-ups, how many of them were invited (joined ones included), how many joined. */
export function waitlistCounts(rows: SignupRow[]) {
  const joined = rows.filter((r) => r.status === "joined").length;
  return { signups: rows.length, invited: rows.filter((r) => r.status === "invited").length + joined, joined };
}
