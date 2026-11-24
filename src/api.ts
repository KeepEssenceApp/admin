// The app talks only to the portal's own /api/. The session is a cookie the page cannot read.
import { createStore } from "./store";
import { t } from "./i18n";

/** null while the first check is running. */
export const signedIn = createStore<boolean | null>(null);

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export async function api<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      // Every request that changes something carries this header; a form on another site cannot send it.
      headers: { ...(method === "GET" ? {} : { "x-ke-admin": "1" }), ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "offline", t("common.offline"));
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  if (res.ok) return data as T;
  const error = (data as { error?: { code?: string; message?: string } } | null)?.error;
  const code = error?.code ?? String(res.status);
  // The session ran out (or was never there): back to the sign-in page.
  if (res.status === 401 && code === "signed_out") signedIn.set(false);
  throw new ApiError(res.status, code, code === "core_unreachable" ? t("common.core_down") : error?.message ?? String(res.status));
}

export const get = <T,>(path: string) => api<T>("GET", path);
export const post = <T,>(path: string, body?: unknown) => api<T>("POST", path, body);
export const del = <T,>(path: string, body?: unknown) => api<T>("DELETE", path, body);

export async function checkSession() {
  try {
    await get("/api/session");
    signedIn.set(true);
  } catch {
    signedIn.set(false);
  }
}

export async function signOut() {
  try {
    await del("/api/session");
  } finally {
    signedIn.set(false);
  }
}
