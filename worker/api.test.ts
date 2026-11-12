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

class Client {
  cookie = '';
  async call(method: string, path: string, body?: unknown) {
    const headers: Record<string, string> = { origin: ORIGIN };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (this.cookie) headers.cookie = this.cookie;
    const res = await worker.fetch(new Request(ORIGIN + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- response shapes vary by route
    return { status: res.status, data: (await res.json()) as Record<string, any> };
  }
}

beforeEach(() => {
  env = { DB: fakeD1(), ADMIN_EMAIL: 'Owner@Example.com' };
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
