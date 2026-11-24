// The shapes the portal's /api/ returns: the core's operator interface (docs/admin-api.md in the
// core repo) plus the sign-up list. Nothing here carries user content.
import type { Invite, SignupRow } from "./shared/waitlist";
export type { Invite, SignupRow, SignupStatus } from "./shared/waitlist";

export interface Calls {
  calls: number;
  input_tokens: number;
  output_tokens: number;
}

export interface CoreOverview {
  users: { total: number; active_7d: number; suspended: number };
  invites: { total: number; pending: number };
  items: { today: number; last_7d: number; live: number };
  analyses: { today: number; last_7d: number };
  digests: { last_7d: number };
  notes: { total: number };
  waiting: { triage: number; analysis: number };
  usage: { today: Calls; last_7d: Calls };
  cron: { minute_ran_at: string | null; hourly_ran_at: string | null };
  config: { model: string; model_configured: boolean; mail_configured: boolean; push_configured: boolean; version: string };
}
export interface Overview {
  core: CoreOverview;
  waitlist: { signups: number; invited: number; joined: number };
}

export interface Waitlist {
  rows: SignupRow[];
}
export interface Invites {
  invites: Invite[];
  mail_configured: boolean;
}
export interface InviteResult {
  added: string[];
  already: string[];
  invalid: string[];
}
export interface LoginCode {
  code: string;
  expires_at: string;
}

export interface UserRow {
  id: string;
  email: string;
  created_at: string;
  last_active_at: string | null;
  status: "active" | "suspended";
  lang: string;
  timezone: string;
  devices: number;
  assistants: number;
  items_live: number;
  notes: number;
  storage_bytes: number;
}
export interface Device {
  id: string;
  name: string;
  client: string;
  tier: string;
  created_at: string;
  last_used_at: string | null;
  notifications: boolean;
}
export interface Assistant {
  id: string;
  name: string;
  kind: string;
  built_in: boolean;
  steps: string[];
  connected_at: string | null;
  last_seen_at: string | null;
}
export interface UserDetail extends Omit<UserRow, "devices" | "assistants"> {
  suspended_at: string | null;
  devices: Device[];
  assistants: Assistant[];
  days: { day: string; saved: number; analysed: number; digests: number; notes: number }[];
  usage: (Calls & { assistant_id: string; name: string; built_in: boolean; items: number })[];
}
export interface Users {
  users: UserRow[];
  next_cursor: string | null;
}

export interface Usage {
  days: (Calls & { day: string; items: number })[];
  top_users: (Calls & { user_id: string; email: string })[];
}

export interface AuditEntry {
  id: string;
  at: string;
  action: string;
  target: string;
  detail: string;
  source: string;
}
export interface Audit {
  entries: AuditEntry[];
  next_cursor: string | null;
}
