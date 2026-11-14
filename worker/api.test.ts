// Runs the Worker's API against a real SQLite database standing in for D1.
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { graduate, introduce, newProgress } from '../src/lib/scheduler';
import { categories } from '../src/lib/content';
import { addDays } from '../src/lib/dates';
import type { Progress } from '../src/lib/types';
import worker, { handleApi, hashPassword, inviteCode, verifyPassword, type D1Database, type Env } from './index';
import { ASKS_PER_MINUTE, content, grant, MAX_IDS, NEW_PER_HOUR } from './cards';
import type { FermiItem } from '../src/lib/fermi';
import type { Clip } from '../src/lib/meeting';
import type { Strategy } from '../src/lib/backtest';
import type { DeskCase } from '../src/lib/types';
import type { Board, Headline } from '../src/lib/modes/rounds';

function fakeD1(): D1Database {
  const sql = new DatabaseSync(':memory:');
  const prepared = (q: string, args: unknown[] = []) => ({
    bind: (...v: unknown[]) => prepared(q, v),
    first: async () => (sql.prepare(q).get(...(args as never[])) ?? null) as never,
    all: async () => ({ results: sql.prepare(q).all(...(args as never[])) as never[] }),
    run: async () => sql.prepare(q).run(...(args as never[])),
  });
  return {
    prepare: (q: string) => prepared(q),
    batch: async (list) => Promise.all(list.map((s) => s.run())),
  };
}

const ORIGIN = 'https://fintermship.example.dev';
let env: Env;

/** A browser in miniature: keeps cookies by path and sends each only where its path covers. */
class Client {
  jar = new Map<string, string>();
  /** The cookies a request to the API would carry. */
  get cookie() {
    return this.cookieFor('/api/me');
  }
  cookieFor(path: string) {
    return [...this.jar]
      .filter(([p]) => path === p || path.startsWith(p === '/' ? '/' : p + '/'))
      .sort((a, b) => b[0].length - a[0].length)
      .map(([, c]) => c)
      .join('; ');
  }
  absorb(res: Response) {
    for (const set of res.headers.getSetCookie()) {
      const [pair, ...attrs] = set.split(';').map((x) => x.trim());
      const path = attrs.find((a) => a.startsWith('Path='))?.slice(5) ?? '/';
      if (/Max-Age=0\b/.test(set) || pair.endsWith('=')) this.jar.delete(path);
      else this.jar.set(path, pair);
    }
  }
  async open(path: string) {
    const headers: Record<string, string> = {};
    const cookie = this.cookieFor(path);
    if (cookie) headers.cookie = cookie;
    const res = await worker.fetch(new Request(ORIGIN + path, { headers }), env);
    this.absorb(res);
    return res;
  }
  /** A call to the API; with `at`, as if the server's clock read that time. */
  async call(method: string, path: string, body?: unknown, at?: number) {
    const headers: Record<string, string> = { origin: ORIGIN };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const cookie = this.cookieFor(path);
    if (cookie) headers.cookie = cookie;
    const req = new Request(ORIGIN + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const res = at === undefined ? await worker.fetch(req, env) : await handleApi(req, env, at);
    this.absorb(res);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response shapes vary by route
    return { status: res.status, data: (await res.json()) as Record<string, any> };
  }
}

/** Stands in for the built app: answers with the path it was asked for. */
const fakeAssets: NonNullable<Env['ASSETS']> = {
  fetch: async (req) => {
    const path = new URL(req.url).pathname;
    const cache = path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate';
    return new Response(`file ${path}`, { headers: { 'cache-control': cache } });
  },
};

beforeEach(() => {
  env = { DB: fakeD1(), ADMIN_EMAIL: 'Owner@Example.com', ASSETS: fakeAssets };
});

describe('worker: accounts', () => {
  it('hashes passwords with a salt and checks them', async () => {
    const h = await hashPassword('correct horse');
    expect(h).not.toContain('correct');
    expect(await verifyPassword('correct horse', h)).toBe(true);
    expect(await verifyPassword('correct horsf', h)).toBe(false);
    expect(await hashPassword('correct horse')).not.toBe(h);
    expect(inviteCode()).toMatch(/^[A-Z2-9]{10}$/);
  });

  it('lets the admin email sign up without an invite, and nobody else', async () => {
    const stranger = new Client();
    const r0 = await stranger.call('POST', '/api/signup', { email: 'x@y.com', password: 'longenough' });
    expect(r0.status).toBe(403);
    expect(r0.data.error).toMatch(/not the admin email/);
    const unset = env;
    env = { DB: fakeD1() };
    expect((await stranger.call('POST', '/api/signup', { email: 'x@y.com', password: 'longenough' })).data.error).toMatch(/no admin email/);
    env = { DB: fakeD1(), OWNER_EMAIL: 'x@y.com' };
    expect((await stranger.call('POST', '/api/signup', { email: 'x@y.com', password: 'longenough' })).data.user.admin).toBe(true);
    env = unset;
    const admin = new Client();
    const r = await admin.call('POST', '/api/signup', { email: ' owner@example.com ', password: 'longenough' });
    expect(r.status).toBe(200);
    expect(r.data.user).toEqual({ email: 'owner@example.com', admin: true, quant: true, phase3: true });
    expect(admin.cookie).toMatch(/^fts_session=/);
    expect((await admin.call('GET', '/api/me')).data.user.admin).toBe(true);
    // The same email can't sign up twice.
    expect((await new Client().call('POST', '/api/signup', { email: 'owner@example.com', password: 'longenough' })).status).toBe(409);
  });

  it('signs up an invited friend with the access on the invite, once', async () => {
    const admin = new Client();
    await admin.call('POST', '/api/signup', { email: 'owner@example.com', password: 'longenough' });
    const { data } = await admin.call('POST', '/api/admin/invites', { quant: true, phase3: false });
    const friend = new Client();
    const r = await friend.call('POST', '/api/signup', { email: 'friend@example.com', password: 'friendpass', invite: data.code.toLowerCase() });
    expect(r.data.user).toEqual({ email: 'friend@example.com', admin: false, quant: true, phase3: false });
    expect((await new Client().call('POST', '/api/signup', { email: 'other@example.com', password: 'otherpass', invite: data.code })).status).toBe(403);
    // Friends can't reach admin routes.
    expect((await friend.call('GET', '/api/admin/users')).status).toBe(403);
    // The admin grants phase 3, then switches the account off.
    const list = await admin.call('GET', '/api/admin/users');
    const id = list.data.users.find((u: { email: string }) => u.email === 'friend@example.com').id;
    await admin.call('POST', '/api/admin/user', { id, phase3: true });
    expect((await friend.call('GET', '/api/me')).data.user.phase3).toBe(true);
    await admin.call('POST', '/api/admin/user', { id, disabled: true });
    expect((await friend.call('GET', '/api/me')).status).toBe(401);
  });

  it('lets the admin switch a mode off and on for everyone, but never Path', async () => {
    const admin = new Client();
    await admin.call('POST', '/api/signup', { email: 'owner@example.com', password: 'longenough' });
    const { data } = await admin.call('POST', '/api/admin/invites', { quant: false, phase3: false });
    const friend = new Client();
    await friend.call('POST', '/api/signup', { email: 'friend@example.com', password: 'friendpass', invite: data.code });
    expect((await friend.call('GET', '/api/site')).data).toEqual({ modesOff: [] });
    expect((await new Client().call('GET', '/api/site')).status).toBe(401);
    // Only the admin can change it, and only for real modes other than Path.
    expect((await friend.call('POST', '/api/admin/modes', { mode: 'callit', on: false })).status).toBe(403);
    expect((await admin.call('POST', '/api/admin/modes', { mode: 'path', on: false })).status).toBe(400);
    expect((await admin.call('POST', '/api/admin/modes', { mode: 'casino', on: false })).status).toBe(400);
    expect((await admin.call('POST', '/api/admin/modes', { mode: 'callit' })).status).toBe(400);
    expect((await admin.call('POST', '/api/admin/modes', { mode: 'exchange', on: false })).data).toEqual({ modesOff: ['exchange'] });
    expect((await admin.call('POST', '/api/admin/modes', { mode: 'callit', on: false })).data).toEqual({ modesOff: ['callit', 'exchange'] });
    expect((await friend.call('GET', '/api/site')).data).toEqual({ modesOff: ['callit', 'exchange'] });
    await admin.call('POST', '/api/admin/modes', { mode: 'exchange', on: true });
    expect((await friend.call('GET', '/api/site')).data).toEqual({ modesOff: ['callit'] });
  });

  it('shows the admin a summary of each learner, not their progress', async () => {
    const admin = new Client();
    await admin.call('POST', '/api/signup', { email: 'owner@example.com', password: 'longenough' });
    const { data } = await admin.call('POST', '/api/admin/invites', { quant: false, phase3: false });
    const friend = new Client();
    await friend.call('POST', '/api/signup', { email: 'friend@example.com', password: 'friendpass', invite: data.code });
    const t = (step: number, correct: number, wrong: number) => ({ step, due: '2026-11-20', seen: 3, correct, wrong, lapses: 0, trouble: false, introduced: '2026-11-01' });
    const p: Progress = {
      ...newProgress(),
      xp: 120,
      streak: 3,
      lastActiveDay: '2026-11-12',
      terms: { a: t(5, 4, 0), b: t(2, 1, 3) },
      days: { '2026-11-12': { xp: 20, newTerms: 2, reviews: 1, lessons: 1 }, '2026-11-11': { xp: 20, newTerms: 2, reviews: 1, lessons: 2 }, '2026-10-01': { xp: 5, newTerms: 1, reviews: 0, lessons: 1 } },
      drills: { d1: { rounds: 2, passed: true, bestRight: 8, last: '2026-11-12' }, d2: { rounds: 1, passed: false, bestRight: 3, last: '2026-11-12' } },
    };
    await friend.call('PUT', '/api/progress', { progress: p });
    const users = (await admin.call('GET', '/api/admin/users')).data.users;
    const f = users.find((u: { email: string }) => u.email === 'friend@example.com');
    expect(f.activity).toMatchObject({ lastDay: '2026-11-12', streak: 3, xp: 120, met: 2, known: 1, right: 5, wrong: 3, passed: 1, week: 2 });
    expect(typeof f.activity.synced).toBe('number');
    expect(f.data).toBeUndefined();
    expect(users.find((u: { email: string }) => u.email === 'owner@example.com').activity).toBeNull();
  });

  it('signs in, rejects a wrong password, locks after repeated tries, and signs out', async () => {
    await new Client().call('POST', '/api/signup', { email: 'owner@example.com', password: 'longenough' });
    const c = new Client();
    expect((await c.call('POST', '/api/login', { email: 'nobody@example.com', password: 'whatever1' })).status).toBe(401);
    expect((await c.call('POST', '/api/login', { email: 'owner@example.com', password: 'longenough' })).status).toBe(200);
    expect((await c.call('GET', '/api/me')).status).toBe(200);
    await c.call('POST', '/api/logout', {});
    expect((await c.call('GET', '/api/me')).status).toBe(401);
    for (let i = 0; i < 8; i++) expect((await c.call('POST', '/api/login', { email: 'owner@example.com', password: 'wrongwrong' })).status).toBe(401);
    expect((await c.call('POST', '/api/login', { email: 'owner@example.com', password: 'longenough' })).status).toBe(429);
  });

  it('refuses writes from another site and without JSON', async () => {
    const res = await worker.fetch(
      new Request(ORIGIN + '/api/login', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' }),
      env,
    );
    expect(res.status).toBe(403);
    const res2 = await worker.fetch(new Request(ORIGIN + '/api/login', { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'text/plain' }, body: '{}' }), env);
    expect(res2.status).toBe(415);
  });

  it('reports what is set up without revealing it', async () => {
    const r = await new Client().call('GET', '/api/status');
    expect(r.data).toEqual({ database: true, adminEmail: true });
    expect(JSON.stringify(r.data)).not.toContain('example');
  });

  it('says sign-in is not set up when there is no database', async () => {
    const res = await worker.fetch(new Request(ORIGIN + '/api/me'), {});
    expect(res.status).toBe(503);
  });
});

describe('worker: progress sync', () => {
  it('stores progress and merges a second device into it', async () => {
    const phone = new Client();
    await phone.call('POST', '/api/signup', { email: 'owner@example.com', password: 'longenough' });
    const laptop = new Client();
    await laptop.call('POST', '/api/login', { email: 'owner@example.com', password: 'longenough' });
    expect((await phone.call('GET', '/api/progress')).data.progress).toBeNull();

    const a: Progress = { ...newProgress(), xp: 50, projects: { p1: { done: [0, 1], reviewed: false } } };
    const b: Progress = { ...newProgress(), xp: 30, projects: { p1: { done: [2], reviewed: true } }, phase3Key: true };
    await phone.call('PUT', '/api/progress', { progress: a });
    const r = await laptop.call('PUT', '/api/progress', { progress: b });
    expect(r.data.progress.xp).toBe(50);
    expect(r.data.progress.projects.p1).toEqual({ done: [0, 1, 2], reviewed: true });
    expect(r.data.progress.phase3Key).toBe(true);
    expect((await phone.call('GET', '/api/progress')).data.progress.xp).toBe(50);
    expect((await phone.call('PUT', '/api/progress', { progress: { nope: 1 } })).status).toBe(400);
    expect((await new Client().call('GET', '/api/progress')).status).toBe(401);
  });
});

describe('worker: the app is for signed-in sessions only', () => {
  it('gives a signed-out visitor the sign-in page and none of the app', async () => {
    const c = new Client();
    for (const path of ['/', '/index.html', '/lines', '/progress']) {
      const res = await c.open(path);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Sign in');
      expect(html).toContain('/api/login');
      expect(html).not.toMatch(/\/assets\/|src\/main|file \//);
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
    for (const path of ['/assets/index-abc123.js', '/assets/content-abc123.js', '/assets/index-abc.css', '/logo.webp', '/textures/grain.png']) {
      const res = await c.open(path);
      expect(res.status).toBe(401);
      expect(await res.text()).not.toContain('file');
    }
    // The sign-in page's own icons and the home-screen manifest stay open.
    for (const path of ['/favicon.ico', '/brand/medallion-64.png', '/manifest.webmanifest']) expect(await (await c.open(path)).text()).toBe(`file ${path}`);
  });

  it('serves the app to a signed-in session, kept in that browser only', async () => {
    const c = new Client();
    await c.call('POST', '/api/signup', { email: 'owner@example.com', password: 'longenough' });
    expect(c.cookieFor('/')).toMatch(/^fts_session=/);
    const js = await c.open('/assets/index-abc123.js');
    expect(await js.text()).toBe('file /assets/index-abc123.js');
    expect(js.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
    const home = await c.open('/');
    expect(await home.text()).toBe('file /');
    expect(home.headers.get('cache-control')).toBe('private, no-cache');
    // Signing out shuts the app again.
    await c.call('POST', '/api/logout', {});
    expect(c.jar.size).toBe(0);
    expect((await c.open('/assets/index-abc123.js')).status).toBe(401);
  });

  it('moves a session from before the sign-in page onto the whole site', async () => {
    const first = new Client();
    await first.call('POST', '/api/signup', { email: 'owner@example.com', password: 'longenough' });
    // An old browser holds the session on /api only.
    const old = new Client();
    old.jar.set('/api', first.jar.get('/')!);
    expect((await old.open('/assets/index-abc123.js')).status).toBe(401);
    expect(await (await old.open('/')).text()).toContain('Sign in');
    // The sign-in page asks /api/me, which re-sends the cookie for every path and clears the old one.
    expect((await old.call('GET', '/api/me')).status).toBe(200);
    expect([...old.jar.keys()]).toEqual(['/']);
    expect(await (await old.open('/assets/index-abc123.js')).text()).toBe('file /assets/index-abc123.js');
  });

  it('turns away a switched-off account and a forged cookie', async () => {
    const admin = new Client();
    await admin.call('POST', '/api/signup', { email: 'owner@example.com', password: 'longenough' });
    const { data } = await admin.call('POST', '/api/admin/invites', { quant: false, phase3: false });
    const friend = new Client();
    await friend.call('POST', '/api/signup', { email: 'friend@example.com', password: 'friendpass', invite: data.code });
    expect((await friend.open('/assets/a.js')).status).toBe(200);
    const id = (await admin.call('GET', '/api/admin/users')).data.users.find((u: { email: string }) => u.email === 'friend@example.com').id;
    await admin.call('POST', '/api/admin/user', { id, disabled: true });
    expect((await friend.open('/assets/a.js')).status).toBe(401);
    const forger = new Client();
    forger.jar.set('/', 'fts_session=not-a-real-token');
    expect((await forger.open('/assets/a.js')).status).toBe(401);
  });

  it('shows nothing of the app when there is no database', async () => {
    const res = await worker.fetch(new Request(ORIGIN + '/assets/a.js'), { ASSETS: fakeAssets });
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain('file');
  });
});

describe('worker: term cards', () => {
  const { cards, phase3 } = content();
  const ids = [...cards.keys()];
  const mainIds = ids.filter((id) => !phase3.has(id));
  const strategyId = [...phase3][0];

  async function friendWith(access: { quant?: boolean; phase3?: boolean } = {}) {
    const admin = new Client();
    await admin.call('POST', '/api/signup', { email: 'owner@example.com', password: 'longenough' });
    const { data } = await admin.call('POST', '/api/admin/invites', { quant: !!access.quant, phase3: !!access.phase3 });
    const friend = new Client();
    await friend.call('POST', '/api/signup', { email: 'friend@example.com', password: 'friendpass', invite: data.code });
    return { admin, friend };
  }

  /** Save progress with these terms met, as the app does after a lesson. */
  async function meet(c: Client, termIds: string[]) {
    let p = newProgress();
    for (const id of termIds) p = introduce(p, id, '2026-11-01');
    expect((await c.call('PUT', '/api/progress', { progress: p })).status).toBe(200);
  }

  it('gives a card only for a term reached, only what teaches it, and has no way to send everything', async () => {
    const { friend } = await friendWith();
    expect((await friend.call('GET', '/api/cards')).status).toBe(404);
    // Not met yet: no card.
    const before = await friend.call('POST', '/api/cards', { ids: ['bid', 'ask', 'not-a-term'] });
    expect(before.data.cards).toEqual({});
    expect(before.data.refused).toEqual(['bid', 'ask']);
    await meet(friend, ['bid', 'ask']);
    const r = await friend.call('POST', '/api/cards', { ids: ['bid', 'ask', 'spread'] });
    expect(Object.keys(r.data.cards).sort()).toEqual(['ask', 'bid']);
    expect(r.data.refused).toEqual(['spread']);
    expect(r.data.cards.bid.definition).toBe(cards.get('bid')!.definition);
    // What its questions are made from stays on the server.
    for (const f of ['fill', 'wrong', 'calcs', 'tf', 'talk', 'claims']) expect(r.data.cards.bid).not.toHaveProperty(f);
    // A term a lesson teaches is reached from then on.
    const lesson = await friend.call('POST', '/api/session', { recipe: { build: 'lesson', keepGoing: true, listen: false }, progress: newProgress(), today: '2026-11-14' });
    const taught = lesson.data.plan.newIds as string[];
    expect(taught.length).toBeGreaterThan(0);
    expect(Object.keys((await friend.call('POST', '/api/cards', { ids: taught })).data.cards).sort()).toEqual([...taught].sort());
    expect((await new Client().call('POST', '/api/cards', { ids: ['bid'] })).status).toBe(401);
  });

  it('has no daily limit: only a ceiling per hour on new terms that no learner reaches', async () => {
    const t0 = Date.UTC(2026, 11, 1, 9);
    await friendWith();
    const db = env.DB!;
    const row = await db.prepare('SELECT id, admin, phase3, created FROM users WHERE email = ?').bind('friend@example.com').first<{ id: number; admin: number; phase3: number; created: number }>();
    const user = row!;
    const want = mainIds.slice(0, NEW_PER_HOUR + 20);
    const first = await grant(db, user, want, t0);
    expect(first.allowed).toEqual(want.slice(0, NEW_PER_HOUR));
    expect(first.refused).toEqual(want.slice(NEW_PER_HOUR));
    // Terms it already has are always allowed, and an hour later there is room again.
    expect((await grant(db, user, want.slice(0, 5), t0 + 1000)).allowed.length).toBe(5);
    expect((await grant(db, user, want.slice(NEW_PER_HOUR), t0 + 3600_000 + 2000)).allowed.length).toBe(20);
  });

  it('sends at most a screen’s worth per ask, and a limited number of asks a minute', async () => {
    const t0 = Date.UTC(2026, 11, 1, 9, 0, 0);
    const { admin, friend } = await friendWith();
    const big = await admin.call('POST', '/api/cards', { ids: mainIds.slice(0, MAX_IDS + 20) }, t0);
    expect(Object.keys(big.data.cards).length).toBe(MAX_IDS);
    for (let i = 0; i < ASKS_PER_MINUTE; i++) expect((await friend.call('POST', '/api/cards', { ids: ['bid'] }, t0 + i)).status).toBe(200);
    const over = await friend.call('POST', '/api/cards', { ids: ['bid'] }, t0 + 100);
    expect(over.status).toBe(429);
    expect((await friend.call('POST', '/api/cards', { ids: ['bid'] }, t0 + 60_000)).status).toBe(200);
  });

  it('keeps phase 3 cards for accounts with phase 3, and lets the admin look up any term', async () => {
    const { admin, friend } = await friendWith();
    await meet(friend, [strategyId, 'bid']);
    const r = await friend.call('POST', '/api/cards', { ids: [strategyId, 'bid'] });
    expect(Object.keys(r.data.cards)).toEqual(['bid']);
    expect(r.data.refused).toEqual([strategyId]);
    expect(r.data.reason).toMatch(/Phase 3/);
    // The admin can have any card, with no hourly ceiling.
    let got = 0;
    for (let i = 0; i < ids.length; i += MAX_IDS) got += Object.keys((await admin.call('POST', '/api/cards', { ids: ids.slice(i, i + MAX_IDS) })).data.cards).length;
    expect(got).toBe(ids.length);
    const { data } = await admin.call('POST', '/api/admin/invites', { quant: false, phase3: true });
    const other = new Client();
    await other.call('POST', '/api/signup', { email: 'p3@example.com', password: 'friendpass', invite: data.code });
    await meet(other, [strategyId]);
    expect(Object.keys((await other.call('POST', '/api/cards', { ids: [strategyId] })).data.cards)).toEqual([strategyId]);
  });

  it('opens phase 3 with the password, checked on the server, and locks after repeated misses', async () => {
    env.UNLOCK_HASH = await hashPassword('open sesame');
    const { friend } = await friendWith();
    await meet(friend, [strategyId]);
    const miss = await friend.call('POST', '/api/unlock', { password: 'wrong' });
    expect(miss.status).toBe(401);
    expect((await friend.call('POST', '/api/cards', { ids: [strategyId] })).data.refused).toEqual([strategyId]);
    const ok = await friend.call('POST', '/api/unlock', { password: ' open sesame ' });
    expect(ok.data.user).toMatchObject({ quant: true, phase3: true });
    expect((await friend.call('GET', '/api/me')).data.user.phase3).toBe(true);
    expect(Object.keys((await friend.call('POST', '/api/cards', { ids: [strategyId] })).data.cards)).toEqual([strategyId]);
    // Eight misses lock the password for a while, even the right one.
    const { friend: guesser } = await (async () => {
      const admin = new Client();
      await admin.call('POST', '/api/login', { email: 'owner@example.com', password: 'longenough' });
      const { data } = await admin.call('POST', '/api/admin/invites', { quant: false, phase3: false });
      const c = new Client();
      await c.call('POST', '/api/signup', { email: 'g@example.com', password: 'friendpass', invite: data.code });
      return { friend: c };
    })();
    for (let i = 0; i < 8; i++) expect((await guesser.call('POST', '/api/unlock', { password: String(i) })).status).toBe(401);
    expect((await guesser.call('POST', '/api/unlock', { password: 'open sesame' })).status).toBe(429);
  });
});

describe('worker: desk cases and game content, dealt and marked', () => {
  const { packs, phase3 } = content();
  const caseIds = [...packs.keys()].filter((id) => id.startsWith('case:'));
  const mainCase = caseIds.find((id) => !phase3.has(id))!.slice(5);
  const p3Case = caseIds.find((id) => phase3.has(id))!.slice(5);

  async function friendWith(access: { phase3?: boolean } = {}) {
    const admin = new Client();
    await admin.call('POST', '/api/signup', { email: 'owner@example.com', password: 'longenough' });
    const { data } = await admin.call('POST', '/api/admin/invites', { quant: false, phase3: !!access.phase3 });
    const friend = new Client();
    await friend.call('POST', '/api/signup', { email: 'friend@example.com', password: 'friendpass', invite: data.code });
    return { admin, friend };
  }

  it('has every desk case and the games content, and phase 3 cases need phase 3', () => {
    expect([...packs.keys()].filter((id) => !id.startsWith('case:')).sort()).toEqual(['backtest', 'fermi', 'finnections', 'finnections:p3', 'headlines', 'headlines:p3', 'meeting']);
    expect(caseIds.length).toBeGreaterThan(0);
    expect(phase3.has(`case:${p3Case}`)).toBe(true);
  });

  it('never gives a pack whole: the cards endpoint has no packs any more', async () => {
    const { friend } = await friendWith();
    const r = await friend.call('POST', '/api/cards', { ids: [], packs: ['meeting', `case:${mainCase}`, 'fermi', 'backtest'] });
    expect(r.status).toBe(200);
    expect(r.data.packs).toBeUndefined();
  });

  it('deals a Fermi round without answers, and marks a guess', async () => {
    const { friend } = await friendWith();
    const { data } = await friend.call('POST', '/api/practice', { kind: 'fermi' });
    expect(data.items.length).toBe(8);
    const text = JSON.stringify(data);
    const all = packs.get('fermi') as FermiItem[];
    for (const it of data.items) {
      expect(Object.keys(it).every((k) => ['id', 'q', 'unit'].includes(k))).toBe(true);
      const f = all.find((x) => x.id === it.id)!;
      expect(text).not.toContain(f.how);
    }
    const f = all.find((x) => x.id === data.items[0].id)!;
    const m = await friend.call('POST', '/api/practice/mark', { kind: 'fermi', id: f.id, guess: 1000 });
    expect(m.data).toMatchObject({ answer: f.answer, how: f.how });
    expect((await friend.call('POST', '/api/practice/mark', { kind: 'fermi', id: f.id })).status).toBe(400);
    expect((await friend.call('POST', '/api/practice/mark', { kind: 'fermi', id: 'nope', guess: 3 })).status).toBe(400);
  });

  it('deals meeting clips without the right option or reason, and marks each question', async () => {
    const { friend } = await friendWith();
    const { data } = await friend.call('POST', '/api/practice', { kind: 'meeting' });
    expect(data.items.length).toBe(5);
    const clips = packs.get('meeting') as Clip[];
    for (const it of data.items) {
      const clip = clips.find((c) => c.id === it.id)!;
      expect(it.questions.length).toBe(2);
      for (const q of it.questions) {
        expect(Object.keys(q).sort()).toEqual(['options', 'q']);
        expect(JSON.stringify(it)).not.toContain(clip.questions.find((x) => x.q === q.q)!.why);
      }
    }
    const clip = clips.find((c) => c.id === data.items[0].id)!;
    const m = await friend.call('POST', '/api/practice/mark', { kind: 'meeting', id: clip.id, q: 1 });
    expect(m.data).toEqual({ answer: clip.questions[1].options[0], why: clip.questions[1].why });
    expect((await friend.call('POST', '/api/practice/mark', { kind: 'meeting', id: clip.id, q: 5 })).status).toBe(400);
  });

  it('deals backtest reports without the flaw, and marks the line', async () => {
    const { friend } = await friendWith();
    const { data } = await friend.call('POST', '/api/practice', { kind: 'backtest' });
    expect(data.items.length).toBeGreaterThan(0);
    const all = packs.get('backtest') as Strategy[];
    for (const it of data.items) {
      expect(it).not.toHaveProperty('answer');
      expect(it).not.toHaveProperty('flaw');
      const c = all.find((s) => s.id === it.id)!.cases[it.case];
      expect(c).toBeDefined();
      expect(JSON.stringify(it)).not.toContain(c.why);
      const m = await friend.call('POST', '/api/practice/mark', { kind: 'backtest', id: it.id, case: it.case });
      expect(m.data.flaw).toBe(c.flaw);
      expect(it.lines[m.data.answer].text).toBe(c.line);
    }
  });

  it('deals a desk case without the best options or reasons, and marks each step', async () => {
    const { friend } = await friendWith();
    const story = packs.get(`case:${mainCase}`) as DeskCase;
    const { data } = await friend.call('POST', '/api/practice', { kind: 'case', unit: mainCase });
    expect(data.steps.length).toBe(story.steps.length);
    const text = JSON.stringify(data);
    expect(text).not.toContain('"best"');
    for (const s of story.steps) for (const o of s.options) expect(text).not.toContain(o.why);
    const m = await friend.call('POST', '/api/practice/mark', { kind: 'case', unit: mainCase, step: 0 });
    expect(m.data.options).toEqual(story.steps[0].options.map((o) => ({ text: o.text, best: !!o.best, why: o.why })));
    expect((await friend.call('POST', '/api/practice', { kind: 'case', unit: 'no-such-case' })).status).toBe(400);
  });

  it('keeps phase 3 cases for accounts with phase 3, and the admin', async () => {
    const { admin, friend } = await friendWith();
    expect((await friend.call('POST', '/api/practice', { kind: 'case', unit: p3Case })).status).toBe(400);
    expect((await friend.call('POST', '/api/practice/mark', { kind: 'case', unit: p3Case, step: 0 })).status).toBe(400);
    expect((await admin.call('POST', '/api/practice', { kind: 'case', unit: p3Case })).status).toBe(200);
  });
});

describe('worker: lessons built and marked on the server', () => {
  const today = '2026-11-14';
  async function friendWith(access: { phase3?: boolean } = {}) {
    const admin = new Client();
    await admin.call('POST', '/api/signup', { email: 'owner@example.com', password: 'longenough' });
    const { data } = await admin.call('POST', '/api/admin/invites', { quant: false, phase3: !!access.phase3 });
    const friend = new Client();
    await friend.call('POST', '/api/signup', { email: 'friend@example.com', password: 'friendpass', invite: data.code });
    return { admin, friend };
  }
  // A learner a little way in: the first dozen main terms met, all due today.
  const mainIds = categories.filter((c) => c.phase !== 3).flatMap((c) => c.terms.map((t) => t.id));
  function learner(n = 12): Progress {
    let p = newProgress();
    for (const id of mainIds.slice(0, n)) p = graduate(introduce(p, id, addDays(today, -3)), id, addDays(today, -3));
    for (const id of mainIds.slice(0, n)) p.terms[id] = { ...p.terms[id], step: 3, due: today };
    return p;
  }
  const scored = (q: { kind: string }) => q.kind !== 'intro' && q.kind !== 'match';

  it('deals a lesson without its answers, and marks each pick with the answer, reason and card', async () => {
    const { friend } = await friendWith();
    const r = await friend.call('POST', '/api/session', { recipe: { build: 'lesson', keepGoing: true, listen: false }, progress: learner(), today });
    expect(r.status).toBe(200);
    const { plan, cards } = r.data;
    expect(plan.questions.length).toBeGreaterThan(5);
    const text = JSON.stringify(plan);
    expect(text).not.toMatch(/"answer"|"why"|"blank"|"wrong"|"calcs"/);
    // The cards of the terms it teaches, without what their questions are made from.
    expect(Object.keys(cards).sort()).toEqual([...plan.newIds].sort());
    for (const c of Object.values(cards) as Record<string, unknown>[]) {
      expect(c.definition).toBeTruthy();
      for (const f of ['fill', 'wrong', 'calcs', 'tf', 'talk', 'claims']) expect(c).not.toHaveProperty(f);
    }
    for (const q of plan.questions.filter(scored)) {
      const m = await friend.call('POST', '/api/mark', { token: q.token });
      expect(m.status).toBe(200);
      expect(m.data.answer).toBeGreaterThanOrEqual(0);
      expect(m.data.answer).toBeLessThan(q.options.length);
      if (q.kind === 'term' || q.kind === 'fill') expect(q.options[m.data.answer]).toBe(q.termId);
      if (q.kind === 'fill') expect(m.data.blank).toBeTruthy();
      if (q.kind === 'calc' || q.kind === 'talk') expect(m.data.why).toBeTruthy();
      expect(m.data.card.definition).toBeTruthy();
      expect(m.data.card).not.toHaveProperty('wrong');
      // A missed question is asked again in a fresh form, sealed the same way.
      expect(q.retry?.token).toBeTruthy();
    }
  });

  it('checks a match one pair at a time', async () => {
    const { friend } = await friendWith();
    const r = await friend.call('POST', '/api/session', { recipe: { build: 'weak' }, progress: { ...learner(), terms: Object.fromEntries(Object.entries(learner().terms).map(([id, s]) => [id, { ...s, wrong: 3, correct: 1, trouble: true }])) }, today });
    const lesson = await friend.call('POST', '/api/session', { recipe: { build: 'lesson', keepGoing: true, listen: false }, progress: learner(), today });
    const match = [...(r.data.plan?.questions ?? []), ...lesson.data.plan.questions].find((q: { kind: string }) => q.kind === 'match');
    expect(match).toBeDefined();
    expect(match.right.length).toBe(match.termIds.length);
    let right = 0;
    for (let l = 0; l < match.termIds.length; l++)
      for (let k = 0; k < match.right.length; k++) if ((await friend.call('POST', '/api/mark', { token: match.token, pair: [l, k] })).data.correct) right++;
    expect(right).toBe(match.termIds.length);
  });

  it('keeps a token to the account it was dealt to, and refuses one that was changed', async () => {
    const { admin, friend } = await friendWith();
    const r = await friend.call('POST', '/api/session', { recipe: { build: 'lesson', keepGoing: true, listen: false }, progress: learner(), today });
    const q = r.data.plan.questions.find(scored);
    expect((await admin.call('POST', '/api/mark', { token: q.token })).status).toBe(400);
    const bent = q.token.slice(0, -4) + (q.token.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect((await friend.call('POST', '/api/mark', { token: bent })).status).toBe(400);
    expect((await friend.call('POST', '/api/mark', { token: 'nonsense' })).status).toBe(400);
  });

  it('builds tests and mode rounds too, and nothing it does not know', async () => {
    const { friend } = await friendWith();
    const area = categories.find((c) => c.phase !== 3)!;
    const test = await friend.call('POST', '/api/session', { recipe: { build: 'test', categoryId: area.id }, progress: newProgress(), today });
    expect(test.status).toBe(200);
    expect(test.data.plan.kind).toBe('test');
    // A test only scores: nothing is asked again.
    expect(test.data.plan.questions.every((q: { retry?: unknown }) => !q.retry)).toBe(true);
    const defend = await friend.call('POST', '/api/session', { recipe: { build: 'defend', termIds: mainIds.slice(0, 3) }, progress: learner(), today });
    expect(defend.data.plan.questions.length).toBeGreaterThan(0);
    expect((await friend.call('POST', '/api/session', { recipe: { build: 'everything' }, progress: learner(), today })).status).toBe(400);
    expect((await friend.call('POST', '/api/session', { recipe: { build: 'lesson' }, today })).status).toBe(400);
  });

  it('keeps phase 3 terms back until the account has phase 3', async () => {
    const { friend } = await friendWith();
    const p3 = categories.filter((c) => c.phase === 3).flatMap((c) => c.terms.map((t) => t.id)).slice(0, 3);
    let p = learner();
    for (const id of p3) p = introduce(p, id, today);
    const r = await friend.call('POST', '/api/session', { recipe: { build: 'defend', termIds: p3 }, progress: p, today });
    expect(r.status).toBe(403);
    expect(r.data.error).toMatch(/Phase 3/);
  });
});

describe('worker: Headline Desk and Finnections rounds', () => {
  const { packs } = content();
  const headlines = packs.get('headlines') as Headline[];
  const boards = packs.get('finnections') as Board[];
  const p3Board = (packs.get('finnections:p3') as Board[])[0];

  async function learner() {
    const admin = new Client();
    await admin.call('POST', '/api/signup', { email: 'owner@example.com', password: 'longenough' });
    const { data } = await admin.call('POST', '/api/admin/invites', { quant: false, phase3: false });
    const friend = new Client();
    await friend.call('POST', '/api/signup', { email: 'friend@example.com', password: 'friendpass', invite: data.code });
    return friend;
  }

  it('deals headlines without their moves, terms or reason, three at most', async () => {
    const friend = await learner();
    const r = await friend.call('POST', '/api/round', { mode: 'headline', ids: [...headlines.slice(0, 5).map((h) => h.id), 'nope'] });
    expect(r.status).toBe(200);
    expect(r.data.items).toHaveLength(3);
    const text = JSON.stringify(r.data);
    for (const h of headlines.slice(0, 3)) {
      expect(text).not.toContain(h.why);
      for (const i of h.items) expect(text).not.toContain(`"${i.term}"`);
    }
    expect(text).not.toMatch(/"move"/);
  });

  it('marks a headline only once every line is called, and then gives the answers', async () => {
    const friend = await learner();
    const h = headlines[0];
    expect((await friend.call('POST', '/api/round/mark', { mode: 'headline', id: h.id, picks: ['up'] })).status).toBe(400);
    const r = await friend.call('POST', '/api/round/mark', { mode: 'headline', id: h.id, picks: h.items.map(() => 'up') });
    expect(r.data.headline).toEqual(h);
  });

  it('deals a board as shuffled tiles, checks each guess, and reveals the groups only when asked at the end', async () => {
    const friend = await learner();
    const b = boards[0];
    const r = await friend.call('POST', '/api/round', { mode: 'finnections', ids: [b.id] });
    const dealt = r.data.items[0];
    expect([...dealt.tiles].sort()).toEqual(b.groups.flatMap((g) => g.terms).sort());
    expect(JSON.stringify(r.data)).not.toContain(b.groups[0].name);
    const hit = await friend.call('POST', '/api/round/mark', { mode: 'finnections', id: b.id, tiles: b.groups[1].terms });
    expect(hit.data.group).toEqual({ ...b.groups[1], order: 1 });
    const three = [...b.groups[0].terms.slice(0, 3), b.groups[2].terms[0]];
    const near = await friend.call('POST', '/api/round/mark', { mode: 'finnections', id: b.id, tiles: three });
    expect(near.data).toEqual({ oneAway: true });
    const all = await friend.call('POST', '/api/round/mark', { mode: 'finnections', id: b.id, reveal: true });
    expect(all.data.groups.map((g: { name: string }) => g.name)).toEqual(b.groups.map((g) => g.name));
  });

  it('keeps phase 3 rounds for accounts with phase 3', async () => {
    const friend = await learner();
    const r = await friend.call('POST', '/api/round', { mode: 'finnections', ids: [p3Board.id] });
    expect(r.data.items).toEqual([]);
    expect((await friend.call('POST', '/api/round/mark', { mode: 'finnections', id: p3Board.id, reveal: true })).status).toBe(400);
  });
});

describe('worker: Call It', () => {
  async function learner() {
    const admin = new Client();
    await admin.call('POST', '/api/signup', { email: 'owner@example.com', password: 'longenough' });
    const { data } = await admin.call('POST', '/api/admin/invites', { quant: false, phase3: false });
    const friend = new Client();
    await friend.call('POST', '/api/signup', { email: 'friend@example.com', password: 'friendpass', invite: data.code });
    return friend;
  }
  const ids = ['bid', 'ask', 'spread', 'ltp', 'liquidity', 'volume'];

  it('deals one claim per term, without whether it is true, and marks each call', async () => {
    const friend = await learner();
    const r = await friend.call('POST', '/api/callit', { ids, known: [] });
    expect(r.data.claims.map((c: { termId: string }) => c.termId)).toEqual(ids);
    for (const c of r.data.claims) expect(Object.keys(c).sort()).toEqual(['termId', 'text']);
    const truths: boolean[] = [];
    for (const c of r.data.claims) {
      const m = await friend.call('POST', '/api/callit/mark', c);
      expect(m.status).toBe(200);
      expect(typeof m.data.why).toBe('string');
      truths.push(m.data.truth);
    }
    expect(truths.filter(Boolean).length).toBe(3);
    expect((await friend.call('POST', '/api/callit/mark', { termId: 'bid', text: 'made up' })).status).toBe(400);
  });

  it('keeps phase 3 terms out of a deck before phase 3', async () => {
    const friend = await learner();
    const strategy = [...content().phase3].find((id) => content().cards.has(id))!;
    const r = await friend.call('POST', '/api/callit', { ids: [strategy, 'bid'], known: [] });
    expect(r.data.claims.map((c: { termId: string }) => c.termId)).toEqual(['bid']);
  });
});
