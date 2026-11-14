/**
 * The fintermship Worker: runs invite-only accounts and progress sync under
 * /api/ on a D1 database, and serves the app's files only to a signed-in
 * session. Everyone else gets the sign-in page and nothing more.
 *
 * Setup (once, in the Cloudflare dashboard):
 * - create a D1 database and put its id in wrangler.jsonc as the DB binding;
 * - add a secret ADMIN_EMAIL: the account with that email signs up without
 *   an invite and becomes the admin, who invites everyone else.
 * Tables are created on first use, so there are no migrations to run.
 */
import { mergeProgress } from '../src/lib/sync';
import type { Progress } from '../src/lib/types';
import { ALWAYS_ON, isModeId, MODES } from '../src/lib/modes/ids';
import { askCards, countAsk } from './cards';
import { dealDeck, markCall } from './callit';
import { dealPractice, markPractice } from './practice';
import { dealRound, markRound } from './rounds';
import { signInPage } from './signin';

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
  /** A PBKDF2 hash of the password that opens the quant switch and phase 3 (scripts/hash-password.mjs); UNLOCK_HASH below when unset. */
  UNLOCK_HASH?: string;
}

// ---------- Settings ----------
const SESSION_DAYS = 30;
const INVITE_DAYS = 14;
const MAX_FAILS = 8;
const LOCK_MINUTES = 15;
const PBKDF2_ROUNDS = 100_000;
const MAX_PROGRESS_BYTES = 1_500_000;
const COOKIE = 'fts_session';
/**
 * The password that opens the quant switch and phase 3, as a salted PBKDF2
 * hash. It is checked here, never in the app. A runtime secret UNLOCK_HASH
 * takes its place; make one with `node scripts/hash-password.mjs`.
 */
const UNLOCK_HASH = 'pbkdf2$100000$wjB2RlNhWdfz41iw3+KiqQ==$MC/2JGBehUY3g9dL5D6NfNJ533mSVj/yWz9SgG7Qlnw=';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, pw TEXT NOT NULL, admin INTEGER NOT NULL DEFAULT 0, quant INTEGER NOT NULL DEFAULT 0, phase3 INTEGER NOT NULL DEFAULT 0, disabled INTEGER NOT NULL DEFAULT 0, fails INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, quant INTEGER NOT NULL, phase3 INTEGER NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, used_by INTEGER)`,
  `CREATE TABLE IF NOT EXISTS progress (user_id INTEGER PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL)`,
  // The term cards each account has been given (worker/cards.ts), for the admin's view of activity and the hourly ceiling.
  `CREATE TABLE IF NOT EXISTS cards (user_id INTEGER NOT NULL, term_id TEXT NOT NULL, issued INTEGER NOT NULL, test TEXT, PRIMARY KEY (user_id, term_id))`,
  `CREATE INDEX IF NOT EXISTS cards_recent ON cards (user_id, issued)`,
  // Asks for cards per account per minute (worker/cards.ts), against scripts.
  `CREATE TABLE IF NOT EXISTS asks (user_id INTEGER NOT NULL, minute INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (user_id, minute))`,
  // Settings for the whole site, set by the admin: 'modes_off' is a JSON list of mode ids switched off for everyone.
  `CREATE TABLE IF NOT EXISTS site (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  // The cases and game content (packs) each account has been given.
  `CREATE TABLE IF NOT EXISTS packs (user_id INTEGER NOT NULL, pack TEXT NOT NULL, issued INTEGER NOT NULL, PRIMARY KEY (user_id, pack))`,
  // Wrong tries at the unlock password, per account.
  `CREATE TABLE IF NOT EXISTS unlock_tries (user_id INTEGER PRIMARY KEY, fails INTEGER NOT NULL, locked_until INTEGER NOT NULL)`,
];

/** What the admin sees of a learner's progress: a handful of counts, never the progress itself. */
export interface Activity {
  /** Last day the learner practised, on their own calendar (YYYY-MM-DD). */
  lastDay: string | null;
  /** The streak as of lastDay; the app decides whether it has lapsed. */
  streak: number;
  xp: number;
  met: number;
  known: number;
  right: number;
  wrong: number;
  /** Practice units (drills, games, cases) passed. */
  passed: number;
  /** Days with a lesson in the 7 days up to lastDay. */
  week: number;
  /** When this account's progress last reached the server (ms). */
  synced: number | null;
}

export function activityOf(data: string | null, synced: number | null): Activity | null {
  if (!data) return null;
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(data);
  } catch {
    return null;
  }
  const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, Record<string, unknown>>) : {});
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const terms = Object.values(obj(p.terms));
  const lastDay = typeof p.lastActiveDay === 'string' ? p.lastActiveDay : null;
  const days = obj(p.days);
  let week = 0;
  if (lastDay) {
    const end = Date.parse(lastDay + 'T00:00:00Z');
    for (const [d, s] of Object.entries(days)) {
      const gap = (end - Date.parse(d + 'T00:00:00Z')) / 864e5;
      if (gap >= 0 && gap < 7 && num(s.lessons) > 0) week++;
    }
  }
  return {
    lastDay,
    streak: num(p.streak),
    xp: num(p.xp),
    met: terms.length,
    known: terms.filter((t) => num(t.step) >= 4).length,
    right: terms.reduce((n, t) => n + num(t.correct), 0),
    wrong: terms.reduce((n, t) => n + num(t.wrong), 0),
    passed: Object.values(obj(p.drills)).filter((d) => d.passed === true).length,
    week,
    synced,
  };
}

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
const json = (body: unknown, status = 200, cookies: string[] = []) => {
  const headers = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(JSON.stringify(body), { status, headers });
};
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

/** Every value sent under this cookie name: a browser can hold two, one per path. */
function cookieValues(request: Request, name: string): string[] {
  const out: string[] = [];
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name && v.length) out.push(v.join('='));
  }
  return out;
}

/**
 * The session cookie covers the whole site, so the app's own files can check
 * it. Sessions from before that lived on /api only; each new cookie also
 * clears that old one.
 */
function sessionCookies(token: string, maxAge: number, secure: boolean): string[] {
  const flags = `HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
  return [`${COOKIE}=; Path=/api; ${flags}; Max-Age=0`, `${COOKIE}=${token}; Path=/; ${flags}; Max-Age=${maxAge}`];
}

interface Session {
  user: UserRow;
  token: string;
  expires: number;
}

/** The signed-in account behind this request's cookie, if any. */
async function sessionOf(request: Request, db: D1Database, now: number): Promise<Session | null> {
  for (const token of cookieValues(request, COOKIE)) {
    const row = await db
      .prepare('SELECT users.*, sessions.expires AS session_expires FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ? AND sessions.expires > ?')
      .bind(await sha256(token), now)
      .first<UserRow & { session_expires: number }>();
    if (row && !row.disabled) {
      const { session_expires, ...user } = row;
      return { user, token, expires: session_expires };
    }
  }
  return null;
}

const publicUser = (u: UserRow) => ({ email: u.email, admin: !!u.admin, quant: !!u.quant, phase3: !!u.phase3 });

function looksLikeProgress(x: unknown): x is Progress {
  return !!x && typeof x === 'object' && (x as Progress).version === 1 && typeof (x as Progress).terms === 'object' && typeof (x as Progress).settings === 'object';
}

const adminEmail = (env: Env) => env.ADMIN_EMAIL || env.OWNER_EMAIL || '';

/** The modes the admin has switched off for everyone. Unknown ids are dropped, and Path is never off. */
export async function modesOff(db: D1Database): Promise<string[]> {
  const row = await db.prepare("SELECT value FROM site WHERE key = 'modes_off'").first<{ value: string }>();
  let list: unknown = [];
  try {
    list = row ? JSON.parse(row.value) : [];
  } catch {
    list = [];
  }
  return Array.isArray(list) ? MODES.filter((m) => m !== ALWAYS_ON && list.includes(m)) : [];
}

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
    return json({ user: publicUser(user) }, 200, sessionCookies(token, SESSION_DAYS * 86400, secure));
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
    for (const token of cookieValues(request, COOKIE)) await db.prepare('DELETE FROM sessions WHERE token = ?').bind(await sha256(token)).run();
    return json({ ok: true }, 200, sessionCookies('', 0, secure));
  }

  const session = await sessionOf(request, db, now);
  if (!session) return fail(401, 'Not signed in.');
  const { user } = session;

  // Also re-sends the cookie for the whole site, which moves a session from before the sign-in page onto it.
  if (route === 'GET /api/me') return json({ user: publicUser(user) }, 200, sessionCookies(session.token, Math.floor((session.expires - now) / 1000), secure));

  if (route === 'POST /api/password') {
    const b = await body();
    const next = typeof b.next === 'string' ? b.next : '';
    if (!(await verifyPassword(typeof b.current === 'string' ? b.current : '', user.pw))) return fail(401, 'Your current password is wrong.');
    if (next.length < 8 || next.length > 200) return fail(400, 'Use a password of at least 8 characters.');
    await db.batch([db.prepare('UPDATE users SET pw = ? WHERE id = ?').bind(await hashPassword(next), user.id), db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id)]);
    return startSession(user);
  }

  // Settings the admin sets for everyone.
  if (route === 'GET /api/site') return json({ modesOff: await modesOff(db) });

  // ---------- Term cards ----------
  // One screen's worth at a time; there is no way to get everything given so far in one go.
  if (route === 'POST /api/cards') {
    if (!(await countAsk(db, user, now))) return fail(429, 'That is a lot of requests at once. Wait a minute and try again.');
    const b = await body();
    return json(await askCards(db, user, b.ids, now));
  }

  // ---------- Headline Desk and Finnections ----------
  // A round is dealt without its answers, and each answer is marked here (worker/rounds.ts).
  if (route === 'POST /api/round' || route === 'POST /api/round/mark') {
    if (!(await countAsk(db, user, now))) return fail(429, 'That is a lot of requests at once. Wait a minute and try again.');
    const b = await body();
    if (route === 'POST /api/round/mark') {
      const out = markRound(user, b);
      return 'error' in out ? fail(400, String(out.error)) : json(out);
    }
    const out = dealRound(user, b.mode, b.ids);
    if ('error' in out) return fail(400, out.error);
    // Recorded like packs, so the admin sees each account's rounds.
    if (out.items.length) await db.batch(out.items.map((x) => db.prepare('INSERT OR IGNORE INTO packs (user_id, pack, issued) VALUES (?, ?, ?)').bind(user.id, `round:${x.id}`, now)));
    return json(out);
  }

  // ---------- Call It ----------
  // A deck is dealt without whether each claim is true, and each call is marked here (worker/callit.ts).
  if (route === 'POST /api/callit' || route === 'POST /api/callit/mark') {
    if (!(await countAsk(db, user, now))) return fail(429, 'That is a lot of requests at once. Wait a minute and try again.');
    const b = await body();
    if (route === 'POST /api/callit') return json(dealDeck(user, b.ids, b.known));
    const out = markCall(user, b.termId, b.text);
    return 'error' in out ? fail(400, out.error) : json(out);
  }

  // ---------- Desk cases, Fermi, the meeting game, backtest detective ----------
  // A round is dealt without its answers, and each answer is marked here (worker/practice.ts).
  if (route === 'POST /api/practice' || route === 'POST /api/practice/mark') {
    if (!(await countAsk(db, user, now))) return fail(429, 'That is a lot of requests at once. Wait a minute and try again.');
    const b = await body();
    const out = route === 'POST /api/practice' ? dealPractice(user, b.kind, b.unit) : markPractice(user, b);
    if ('error' in out) return fail(400, String(out.error));
    // Recorded like packs, so the admin sees what each account has opened.
    if (route === 'POST /api/practice') await db.prepare('INSERT OR IGNORE INTO packs (user_id, pack, issued) VALUES (?, ?, ?)').bind(user.id, b.kind === 'case' ? `case:${String(b.unit)}` : String(b.kind), now).run();
    return json(out);
  }

  // The password for the quant switch and phase 3: right once, and the account keeps both.
  if (route === 'POST /api/unlock') {
    const b = await body();
    const tries = await db.prepare('SELECT fails, locked_until FROM unlock_tries WHERE user_id = ?').bind(user.id).first<{ fails: number; locked_until: number }>();
    if (tries && tries.locked_until > now) return fail(429, `Too many tries. Wait ${Math.ceil((tries.locked_until - now) / 60000)} minutes and try again.`);
    const password = typeof b.password === 'string' ? b.password.trim() : '';
    if (!password || password.length > 200 || !(await verifyPassword(password, env.UNLOCK_HASH || UNLOCK_HASH))) {
      const fails = (tries?.fails ?? 0) + 1;
      const lock = fails >= MAX_FAILS;
      await db
        .prepare('INSERT INTO unlock_tries (user_id, fails, locked_until) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET fails = excluded.fails, locked_until = excluded.locked_until')
        .bind(user.id, lock ? 0 : fails, lock ? now + LOCK_MINUTES * 60000 : 0)
        .run();
      return fail(401, 'That password isn’t right.');
    }
    await db.batch([db.prepare('UPDATE users SET quant = 1, phase3 = 1 WHERE id = ?').bind(user.id), db.prepare('DELETE FROM unlock_tries WHERE user_id = ?').bind(user.id)]);
    return json({ user: publicUser({ ...user, quant: 1, phase3: 1 }) });
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
    if (!looksLikeProgress(incoming)) return fail(400, 'That is not fintermship progress.');
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
      const { results } = await db
        .prepare('SELECT u.id, u.email, u.admin, u.quant, u.phase3, u.disabled, u.created, p.data, p.updated FROM users u LEFT JOIN progress p ON p.user_id = u.id ORDER BY u.created')
        .all<Record<string, unknown>>();
      const users = results.map(({ data, updated, ...u }) => ({ ...u, activity: activityOf(typeof data === 'string' ? data : null, typeof updated === 'number' ? updated : null) }));
      const invites = await db.prepare('SELECT code, quant, phase3, created, expires FROM invites WHERE used_by IS NULL AND expires > ? ORDER BY created DESC').bind(now).all();
      return json({ users, invites: invites.results });
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

    if (route === 'POST /api/admin/modes') {
      const b = await body();
      if (!isModeId(b.mode)) return fail(400, 'No such mode.');
      if (b.mode === ALWAYS_ON) return fail(400, 'Path stays on: it holds the lessons, drills and tests.');
      if (typeof b.on !== 'boolean') return fail(400, 'Say whether the mode is on.');
      const now = new Set(await modesOff(db));
      if (b.on) now.delete(b.mode);
      else now.add(b.mode);
      const list = MODES.filter((m) => now.has(m));
      await db
        .prepare("INSERT INTO site (key, value) VALUES ('modes_off', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .bind(JSON.stringify(list))
        .run();
      return json({ modesOff: list });
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

// ---------- The app's files ----------
/** Files the sign-in page and an installed home-screen icon need. They hold nothing of the app. */
const PUBLIC_FILES = /^\/(favicon\.ico|manifest\.webmanifest|apple-touch-icon\.png|robots\.txt|brand\/[\w.-]+\.png)$/;

const page = (html: string, status: number) =>
  new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });

/** A page load gets the sign-in page; a script, style sheet, image or data file gets nothing. */
const wantsPage = (url: URL) => url.pathname === '/' || url.pathname.endsWith('.html') || !/\.[a-z0-9]+$/i.test(url.pathname);

/**
 * Serves a file of the app, but only to a signed-in session. A browser keeps
 * what it is sent for this one person (private), never a shared cache.
 */
export async function serveApp(request: Request, env: Env, now = Date.now()): Promise<Response> {
  const url = new URL(request.url);
  if (!env.ASSETS) return new Response('Not found', { status: 404 });
  if (PUBLIC_FILES.test(url.pathname)) return env.ASSETS.fetch(request);
  const db = env.DB;
  if (!db) return page('<!doctype html><title>fintermship</title><p>Sign-in is not set up on this server yet.</p>', 503);
  await ensureSchema(db);
  if (!(await sessionOf(request, db, now))) {
    if (request.method === 'GET' && wantsPage(url)) return page(signInPage(), 200);
    return new Response('Sign in first.', { status: 401, headers: { 'cache-control': 'no-store' } });
  }
  const res = await env.ASSETS.fetch(request);
  const out = new Response(res.body, res);
  const cache = res.headers.get('cache-control');
  out.headers.set('cache-control', cache && /immutable/.test(cache) ? 'private, max-age=31536000, immutable' : 'private, no-cache');
  return out;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env);
      return await serveApp(request, env);
    } catch (e) {
      console.error(e);
      return url.pathname.startsWith('/api/') ? fail(500, 'Something went wrong on the server.') : page('<!doctype html><title>fintermship</title><p>Something went wrong. Reload to try again.</p>', 500);
    }
  },
};
