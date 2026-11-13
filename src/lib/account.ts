/**
 * The browser side of accounts and sync: calls to the Worker's /api routes.
 * Progress is always saved in the browser first; a signed-in account also
 * sends it to the server, which merges it with what other devices sent.
 */
import { normalise } from './storage';
import type { Progress } from './types';

export interface Me {
  email: string;
  admin: boolean;
  quant: boolean;
  phase3: boolean;
}

export interface AdminUser {
  id: number;
  email: string;
  admin: number;
  quant: number;
  phase3: number;
  disabled: number;
  created: number;
  /** Counts from the learner's synced progress; null until they first sync. */
  activity: {
    lastDay: string | null;
    streak: number;
    xp: number;
    met: number;
    known: number;
    right: number;
    wrong: number;
    passed: number;
    week: number;
    synced: number | null;
  } | null;
}
export interface Invite {
  code: string;
  quant: number;
  phase3: number;
  created: number;
  expires: number;
}

/** 'off' means this server has no sign-in set up (or there is no server, as in local preview). */
export type AccountState = { kind: 'loading' } | { kind: 'off' } | { kind: 'offline' } | { kind: 'out' } | { kind: 'in'; me: Me };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'You seem to be offline. Progress is still saved on this device.');
  }
  const type = res.headers.get('content-type') ?? '';
  // Without a Worker, /api/ falls through to the app's own page.
  if (!type.includes('application/json')) throw new ApiError(503, 'Sign-in is not available here.');
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Something went wrong.');
  return data;
}

export async function fetchAccount(): Promise<AccountState> {
  try {
    const { user } = await api<{ user: Me }>('GET', 'me');
    return { kind: 'in', me: user };
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return { kind: 'out' };
    if (e instanceof ApiError && e.status === 0) return { kind: 'offline' };
    return { kind: 'off' };
  }
}

export const signIn = (email: string, password: string) => api<{ user: Me }>('POST', 'login', { email, password }).then((r) => r.user);
export const signUp = (email: string, password: string, invite: string) => api<{ user: Me }>('POST', 'signup', { email, password, invite }).then((r) => r.user);
export const signOut = () => api<{ ok: true }>('POST', 'logout', {});
export const changePassword = (current: string, next: string) => api<{ user: Me }>('POST', 'password', { current, next });
/** The password for the quant switch and phase 3, checked on the server. Right once, and the account keeps both. */
export const unlock = (password: string) => api<{ user: Me }>('POST', 'unlock', { password }).then((r) => r.user);

/** Send this device's progress; get back the merge of every device's. */
export async function pushProgress(p: Progress): Promise<Progress> {
  const { progress } = await api<{ progress: Progress }>('PUT', 'progress', { progress: p });
  return normalise(progress);
}
export async function pullProgress(): Promise<Progress | null> {
  const { progress } = await api<{ progress: Progress | null }>('GET', 'progress');
  return progress ? normalise(progress) : null;
}

export const adminList = () => api<{ users: AdminUser[]; invites: Invite[] }>('GET', 'admin/users');
export const adminInvite = (quant: boolean, phase3: boolean) => api<{ code: string; expires: number }>('POST', 'admin/invites', { quant, phase3 });
export const adminDeleteInvite = (code: string) => api<{ ok: true }>('POST', 'admin/invites/delete', { code });
export const adminUpdate = (id: number, change: Partial<Record<'quant' | 'phase3' | 'disabled', boolean>>) => api<{ ok: true }>('POST', 'admin/user', { id, ...change });
