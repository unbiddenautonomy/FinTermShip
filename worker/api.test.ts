// Runs the Worker's API against a real SQLite database standing in for D1.
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { newProgress } from '../src/lib/scheduler';
import type { Progress } from '../src/lib/types';
import worker, { hashPassword, inviteCode, verifyPassword, type D1Database, type Env } from './index';

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
  async call(method: string, path: string, body?: unknown) {
    const headers: Record<string, string> = { origin: ORIGIN };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const cookie = this.cookieFor(path);
    if (cookie) headers.cookie = cookie;
    const res = await worker.fetch(new Request(ORIGIN + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
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
