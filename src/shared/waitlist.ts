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

export interface Invite {
  email: string;
  invited_at: string;
  joined_at: string | null;
  user_id: string | null;
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
