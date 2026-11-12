/**
 * The FinTermShip Worker: serves the app, and under /api/ runs invite-only
 * accounts and progress sync on a D1 database.
 *
 * Setup (once, in the Cloudflare dashboard):
 * - create a D1 database and put its id in wrangler.jsonc as the DB binding;
 * - add a secret ADMIN_EMAIL: the account with that email signs up without
 *   an invite and becomes the admin, who invites everyone else.
 * Tables are created on first use, so there are no migrations to run.
 * Without a database the app still works, saving progress in the browser only.
 */
import { mergeProgress } from '../src/lib/sync';
import type { Progress } from '../src/lib/types';

// ---------- The few Cloudflare types this file uses ----------
interface D1Result<T> {
  results: T[];
}
interface D1Prepared {
  bind(...values: unknown[]): D1Prepared;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}
export interface D1Database {
  prepare(sql: string): D1Prepared;
  batch(statements: D1Prepared[]): Promise<unknown[]>;
}
export interface Env {
  ASSETS?: { fetch(request: Request): Promise<Response> };
  DB?: D1Database;
  ADMIN_EMAIL?: string;
  /** The same, set in wrangler.jsonc; ADMIN_EMAIL wins when both are set. */
  OWNER_EMAIL?: string;
}

// ---------- Settings ----------
const SESSION_DAYS = 30;
const INVITE_DAYS = 14;
const MAX_FAILS = 8;
const LOCK_MINUTES = 15;
const PBKDF2_ROUNDS = 100_000;
const MAX_PROGRESS_BYTES = 1_500_000;
const COOKIE = 'fts_session';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, pw TEXT NOT NULL, admin INTEGER NOT NULL DEFAULT 0, quant INTEGER NOT NULL DEFAULT 0, phase3 INTEGER NOT NULL DEFAULT 0, disabled INTEGER NOT NULL DEFAULT 0, fails INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, quant INTEGER NOT NULL, phase3 INTEGER NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, used_by INTEGER)`,
  `CREATE TABLE IF NOT EXISTS progress (user_id INTEGER PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL)`,
];

interface UserRow {
  id: number;
  email: string;
  pw: string;
  admin: number;
  quant: number;
  phase3: number;
  disabled: number;
  fails: number;
  locked_until: number;
  created: number;
}

// ---------- Small helpers ----------
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const fail = (status: number, error: string) => json({ error }, status);

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

async function sha256(text: string): Promise<string> {
  return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
}

async function pbkdf2(password: string, salt: Uint8Array, rounds: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds }, key, 256));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `pbkdf2$${PBKDF2_ROUNDS}$${b64(salt)}$${b64(await pbkdf2(password, salt, PBKDF2_ROUNDS))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, rounds, salt, hash] = stored.split('$');
  if (kind !== 'pbkdf2') return false;
  const got = await pbkdf2(password, unb64(salt), Number(rounds));
  const want = unb64(hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

/** Ten letters and digits, with the easily confused ones (0, O, 1, I, L) left out. */
export function inviteCode(): string {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(10), (b) => abc[b % abc.length]).join('');
}

const cleanEmail = (x: unknown) => (typeof x === 'string' ? x.trim().toLowerCase() : '');
const validEmail = (e: string) => e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function cookieValue(request: Request, name: string): string | null {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

function sessionCookie(token: string, maxAge: number, secure: boolean): string {
  return `${COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

const publicUser = (u: UserRow) => ({ email: u.email, admin: !!u.admin, quant: !!u.quant, phase3: !!u.phase3 });

function looksLikeProgress(x: unknown): x is Progress {
  return !!x && typeof x === 'object' && (x as Progress).version === 1 && typeof (x as Progress).terms === 'object' && typeof (x as Progress).settings === 'object';
}

const adminEmail = (env: Env) => env.ADMIN_EMAIL || env.OWNER_EMAIL || '';

// ---------- The API ----------
const schemaReady = new WeakMap<D1Database, Promise<unknown>>();
function ensureSchema(db: D1Database): Promise<unknown> {
  let ready = schemaReady.get(db);
  if (!ready) {
    ready = db.batch(SCHEMA.map((s) => db.prepare(s))).catch((e) => {
      schemaReady.delete(db);
      throw e;
    });
    schemaReady.set(db, ready);
  }
  return ready;
}

export async function handleApi(request: Request, env: Env, now = Date.now()): Promise<Response> {
  const url = new URL(request.url);
  const route = `${request.method} ${url.pathname}`;
  const db = env.DB;
  // A setup check anyone can open: says what is configured, never the values.
  if (route === 'GET /api/status') return json({ database: !!db, adminEmail: !!adminEmail(env) });
  if (!db) return fail(503, 'Sign-in is not set up on this server yet.');
  // Writes must come from this site: a second guard beside the SameSite cookie.
  if (request.method !== 'GET') {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return fail(403, 'Wrong origin.');
    if (!(request.headers.get('content-type') ?? '').includes('application/json')) return fail(415, 'Send JSON.');
  }
  await ensureSchema(db);
  const secure = url.protocol === 'https:';

  const body = async (): Promise<Record<string, unknown>> => {
    try {
      const b = await request.json();
      return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  };

  const startSession = async (user: UserRow) => {
    const token = b64(randomBytes(32)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!);
    await db.batch([
      db.prepare('DELETE FROM sessions WHERE expires < ?').bind(now),
      db.prepare('INSERT INTO sessions (token, user_id, expires) VALUES (?, ?, ?)').bind(await sha256(token), user.id, now + SESSION_DAYS * 864e5),
    ]);
    return json({ user: publicUser(user) }, 200, { 'set-cookie': sessionCookie(token, SESSION_DAYS * 86400, secure) });
  };

  const currentUser = async (): Promise<UserRow | null> => {
    const token = cookieValue(request, COOKIE);
    if (!token) return null;
    const row = await db
      .prepare('SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ? AND sessions.expires > ?')
      .bind(await sha256(token), now)
      .first<UserRow>();
    return row && !row.disabled ? row : null;
  };

  if (route === 'POST /api/signup') {
    const b = await body();
    const email = cleanEmail(b.email);
    const password = typeof b.password === 'string' ? b.password : '';
    const code = typeof b.invite === 'string' ? b.invite.trim().toUpperCase() : '';
    if (!validEmail(email)) return fail(400, 'Enter a valid email address.');
    if (password.length < 8 || password.length > 200) return fail(400, 'Use a password of at least 8 characters.');
    const isAdmin = !!adminEmail(env) && email === cleanEmail(adminEmail(env));
    let grant = { quant: 0, phase3: 0 };
    if (!isAdmin) {
      const invite = await db.prepare('SELECT * FROM invites WHERE code = ?').bind(code).first<{ quant: number; phase3: number; expires: number; used_by: number | null }>();
      if (!code || !invite || invite.used_by !== null || invite.expires < now) {
        // Until the admin has signed up, say why, so a setup slip is easy to spot.
        if (!code && !(await db.prepare('SELECT id FROM users WHERE admin = 1').first()))
          return fail(
            403,
            adminEmail(env)
              ? 'This email is not the admin email set on the server. Check the ADMIN_EMAIL secret for a typo.'
              : 'The server has no admin email yet. Add ADMIN_EMAIL as a Secret under the Worker’s Settings, Variables and secrets (not the Build settings).',
          );
        return fail(403, 'That invite code is not valid. Ask for a new one.');
      }
      grant = { quant: invite.quant, phase3: invite.phase3 };
    }
    if (await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()) return fail(409, 'That email already has an account. Sign in instead.');
    await db
      .prepare('INSERT INTO users (email, pw, admin, quant, phase3, created) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(email, await hashPassword(password), isAdmin ? 1 : 0, isAdmin ? 1 : grant.quant, isAdmin ? 1 : grant.phase3, now)
      .run();
    const user = (await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>())!;
    if (!isAdmin) await db.prepare('UPDATE invites SET used_by = ? WHERE code = ? AND used_by IS NULL').bind(user.id, code).run();
    return startSession(user);
  }

  if (route === 'POST /api/login') {
    const b = await body();
    const email = cleanEmail(b.email);
    const password = typeof b.password === 'string' ? b.password : '';
    const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
    const wrong = 'That email and password don’t match.';
    if (!user) {
      // Spend the same time as a real check, so timing doesn't reveal which emails have accounts.
      await pbkdf2(password, randomBytes(16), PBKDF2_ROUNDS);
      return fail(401, wrong);
    }
    if (user.locked_until > now) return fail(429, `Too many tries. Wait ${Math.ceil((user.locked_until - now) / 60000)} minutes and try again.`);
    if (!(await verifyPassword(password, user.pw))) {
      const fails = user.fails + 1;
      await db
        .prepare('UPDATE users SET fails = ?, locked_until = ? WHERE id = ?')
        .bind(fails >= MAX_FAILS ? 0 : fails, fails >= MAX_FAILS ? now + LOCK_MINUTES * 60000 : 0, user.id)
        .run();
      return fail(401, wrong);
    }
    if (user.disabled) return fail(403, 'This account is switched off. Ask the admin.');
    await db.prepare('UPDATE users SET fails = 0, locked_until = 0 WHERE id = ?').bind(user.id).run();
    return startSession(user);
  }

  if (route === 'POST /api/logout') {
    const token = cookieValue(request, COOKIE);
    if (token) await db.prepare('DELETE FROM sessions WHERE token = ?').bind(await sha256(token)).run();
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0, secure) });
  }

  const user = await currentUser();
  if (!user) return fail(401, 'Not signed in.');

  if (route === 'GET /api/me') return json({ user: publicUser(user) });

  if (route === 'POST /api/password') {
    const b = await body();
    const next = typeof b.next === 'string' ? b.next : '';
    if (!(await verifyPassword(typeof b.current === 'string' ? b.current : '', user.pw))) return fail(401, 'Your current password is wrong.');
    if (next.length < 8 || next.length > 200) return fail(400, 'Use a password of at least 8 characters.');
    await db.batch([db.prepare('UPDATE users SET pw = ? WHERE id = ?').bind(await hashPassword(next), user.id), db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id)]);
    return startSession(user);
  }

  if (route === 'GET /api/progress') {
    const row = await db.prepare('SELECT data, updated FROM progress WHERE user_id = ?').bind(user.id).first<{ data: string; updated: number }>();
    return json({ progress: row ? JSON.parse(row.data) : null, updated: row?.updated ?? null });
  }

  if (route === 'PUT /api/progress') {
    const text = await request.text();
    if (text.length > MAX_PROGRESS_BYTES) return fail(413, 'Progress is too large to sync.');
    let incoming: unknown;
    try {
      incoming = JSON.parse(text).progress;
    } catch {
      return fail(400, 'Send progress as JSON.');
    }
    if (!looksLikeProgress(incoming)) return fail(400, 'That is not FinTermShip progress.');
    const row = await db.prepare('SELECT data FROM progress WHERE user_id = ?').bind(user.id).first<{ data: string }>();
    const merged = row ? mergeProgress(JSON.parse(row.data) as Progress, incoming) : incoming;
    await db
      .prepare('INSERT INTO progress (user_id, data, updated) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated = excluded.updated')
      .bind(user.id, JSON.stringify(merged), now)
      .run();
    return json({ progress: merged, updated: now });
  }

  // ---------- Admin ----------
  if (url.pathname.startsWith('/api/admin/')) {
    if (!user.admin) return fail(403, 'Only the admin can do that.');

    if (route === 'GET /api/admin/users') {
      const { results } = await db.prepare('SELECT id, email, admin, quant, phase3, disabled, created FROM users ORDER BY created').all();
      const invites = await db.prepare('SELECT code, quant, phase3, created, expires FROM invites WHERE used_by IS NULL AND expires > ? ORDER BY created DESC').bind(now).all();
      return json({ users: results, invites: invites.results });
    }

    if (route === 'POST /api/admin/invites') {
      const b = await body();
      const code = inviteCode();
      await db
        .prepare('INSERT INTO invites (code, quant, phase3, created, expires) VALUES (?, ?, ?, ?, ?)')
        .bind(code, b.quant ? 1 : 0, b.phase3 ? 1 : 0, now, now + INVITE_DAYS * 864e5)
        .run();
      return json({ code, expires: now + INVITE_DAYS * 864e5 });
    }

    if (route === 'POST /api/admin/invites/delete') {
      const b = await body();
      await db.prepare('DELETE FROM invites WHERE code = ? AND used_by IS NULL').bind(String(b.code ?? '')).run();
      return json({ ok: true });
    }

    if (route === 'POST /api/admin/user') {
      const b = await body();
      const id = Number(b.id);
      const target = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
      if (!target) return fail(404, 'No such account.');
      if (target.admin) return fail(400, 'The admin account keeps full access.');
      const flag = (k: 'quant' | 'phase3' | 'disabled') => (typeof b[k] === 'boolean' ? (b[k] ? 1 : 0) : target[k]);
      await db.prepare('UPDATE users SET quant = ?, phase3 = ?, disabled = ? WHERE id = ?').bind(flag('quant'), flag('phase3'), flag('disabled'), id).run();
      if (flag('disabled')) await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
      return json({ ok: true });
    }
  }

  return fail(404, 'No such endpoint.');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env);
      } catch (e) {
        console.error(e);
        return fail(500, 'Something went wrong on the server.');
      }
    }
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
  },
};
