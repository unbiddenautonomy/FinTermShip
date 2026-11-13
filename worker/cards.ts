/**
 * Term cards: what each term means, its examples and its questions. The app
 * ships with term names only; this is the one place the rest lives, and each
 * account gets only the cards it has reached:
 *
 * - every card it was given before (kept in `cards`, so any device can load them);
 * - new terms as the learner reaches them, up to NEW_PER_DAY in any 24 hours;
 * - an area test's core terms, for up to TESTS_PER_DAY area tests in any 24 hours;
 * - phase 3 terms only once the account has phase 3 (the password, or the admin).
 *
 * Packs work the same way: a desk case, or one game's content (meeting clips,
 * Fermi questions, backtest reports), given when the learner opens it, up to
 * PACKS_PER_DAY new ones in any 24 hours, phase 3 cases only with phase 3.
 *
 * The admin gets any card or pack. Someone signed in can still save what they've been
 * given, but never the syllabus in one go: that takes weeks at the daily cap,
 * and the admin sees each account's activity.
 */
import { buildCards, buildPacks, fullCategories } from '../src/lib/cardData';
import { PHASE3_PREREQS } from '../src/lib/phase3prereqs';
import type { Card, Progress } from '../src/lib/types';

/** New terms an account can be given in any 24 hours. Path's largest daily goal is 40. */
export const NEW_PER_DAY = 60;
/** Area tests (each gives that area's core terms) an account can start in any 24 hours. */
export const TESTS_PER_DAY = 3;
/** New packs (cases and game content) an account can be given in any 24 hours. */
export const PACKS_PER_DAY = 6;
/** Accounts made before this get the cards for the terms in their synced progress, once. */
export const SEED_BEFORE = Date.UTC(2026, 10, 15);

const DAY = 864e5;

/** A short fingerprint of every card (two FNV-1a hashes), so a device knows when the syllabus changed. */
function fingerprint(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c, 2246822519);
  }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36);
}

/**
 * The cards and the facts the rules need. Built when the Worker starts, not on
 * a request, so no request pays for it.
 */
const built = (() => {
  const cards = buildCards();
  const packs = buildPacks();
  // Term ids and pack ids ('case:<unit>') that need phase 3.
  const phase3 = new Set<string>();
  const core = new Map<string, Set<string>>();
  for (const c of fullCategories) {
    const coreUnits = new Set(c.units.filter((u) => u.core).map((u) => u.id));
    core.set(c.id, new Set(c.terms.filter((t) => coreUnits.has(t.unit)).map((t) => t.id)));
    if (c.phase === 3) {
      for (const t of c.terms) phase3.add(t.id);
      for (const u of c.units) phase3.add(`case:${u.id}`);
    }
  }
  core.set('phase3', new Set(PHASE3_PREREQS));
  return { cards, packs, phase3, core, version: fingerprint(JSON.stringify([...cards, ...packs])) };
})();

export function content() {
  return built;
}

export interface CardsDb {
  prepare(sql: string): {
    bind(...values: unknown[]): CardsDbStatement;
  } & CardsDbStatement;
  batch(statements: CardsDbStatement[]): Promise<unknown[]>;
}
interface CardsDbStatement {
  bind(...values: unknown[]): CardsDbStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface CardsUser {
  id: number;
  admin: number;
  phase3: number;
  created: number;
}

/** Record cards as given: a few rows per statement, under D1's limit on bound values. */
function issue(db: CardsDb, userId: number, ids: string[], at: number, test: string | null): CardsDbStatement[] {
  const out: CardsDbStatement[] = [];
  for (let i = 0; i < ids.length; i += 24) {
    const chunk = ids.slice(i, i + 24);
    out.push(
      db
        .prepare(`INSERT OR IGNORE INTO cards (user_id, term_id, issued, test) VALUES ${chunk.map(() => '(?, ?, ?, ?)').join(', ')}`)
        .bind(...chunk.flatMap((id) => [userId, id, at, test])),
    );
  }
  return out;
}

/**
 * Accounts from before cards came from the server: give them the cards for the
 * terms they had already met (from their synced progress), once, without
 * counting against the day's allowance. Phase 3 opened with the old password
 * carries over too.
 */
export async function seedOnce(db: CardsDb, user: CardsUser, now: number): Promise<void> {
  if (await db.prepare('SELECT user_id FROM card_seed WHERE user_id = ?').bind(user.id).first()) return;
  const statements: CardsDbStatement[] = [db.prepare('INSERT OR IGNORE INTO card_seed (user_id, at) VALUES (?, ?)').bind(user.id, now)];
  if (user.created < SEED_BEFORE) {
    const row = await db.prepare('SELECT data FROM progress WHERE user_id = ?').bind(user.id).first<{ data: string }>();
    let p: Partial<Progress> = {};
    try {
      p = row ? (JSON.parse(row.data) as Progress) : {};
    } catch {
      p = {};
    }
    const { cards, phase3 } = content();
    const open3 = !!user.phase3 || !!user.admin || p.phase3Key === true;
    if (p.phase3Key === true && !user.phase3) statements.push(db.prepare('UPDATE users SET phase3 = 1 WHERE id = ?').bind(user.id));
    const met = Object.keys(p.terms && typeof p.terms === 'object' ? p.terms : {}).filter((id) => cards.has(id) && (open3 || !phase3.has(id)));
    statements.push(...issue(db, user.id, met, 0, 'seed'));
  }
  await db.batch(statements);
}

export interface CardsReply {
  version: string;
  at: number;
  cards: Record<string, Card>;
  packs: Record<string, unknown>;
  refused?: string[];
  reason?: string;
}

/** Every card and pack this account has been given; with `have` (the version on the device) and `since`, only those given since. */
export async function givenCards(db: CardsDb, user: CardsUser, now: number, have: string | null, since: number): Promise<CardsReply> {
  await seedOnce(db, user, now);
  const { cards, packs, version: v } = content();
  const from = have === v ? since : 0;
  const [{ results }, { results: packRows }] = await Promise.all([
    db.prepare('SELECT term_id FROM cards WHERE user_id = ? AND issued >= ?').bind(user.id, from).all<{ term_id: string }>(),
    db.prepare('SELECT pack FROM packs WHERE user_id = ? AND issued >= ?').bind(user.id, from).all<{ pack: string }>(),
  ]);
  const out: Record<string, Card> = {};
  for (const { term_id } of results) {
    const c = cards.get(term_id);
    if (c) out[term_id] = c;
  }
  const outPacks: Record<string, unknown> = {};
  for (const { pack } of packRows) if (packs.has(pack)) outPacks[pack] = packs.get(pack);
  return { version: v, at: now, cards: out, packs: outPacks };
}

/** Give these packs, under the rules at the top of this file. Packs already given come back whatever the allowance. */
export async function askPacks(db: CardsDb, user: CardsUser, ids: unknown, now: number): Promise<{ packs: Record<string, unknown>; refused: string[]; reason?: string }> {
  const { packs, phase3 } = content();
  const wanted = [...new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string' && packs.has(x)) : [])].slice(0, 40);
  const out: Record<string, unknown> = {};
  const refused: string[] = [];
  let reason: string | undefined;
  if (!wanted.length) return { packs: out, refused };
  const { results } = await db
    .prepare(`SELECT pack FROM packs WHERE user_id = ? AND pack IN (${wanted.map(() => '?').join(', ')})`)
    .bind(user.id, ...wanted)
    .all<{ pack: string }>();
  const given = new Set(results.map((r) => r.pack));
  const fresh: string[] = [];
  for (const id of wanted) {
    if (given.has(id)) continue;
    if (phase3.has(id) && !user.phase3 && !user.admin) {
      refused.push(id);
      reason = 'Phase 3 cases open once phase 3 is unlocked on your account.';
    } else fresh.push(id);
  }
  let allowed = fresh;
  if (!user.admin && fresh.length) {
    const recent = await db.prepare('SELECT COUNT(*) AS n FROM packs WHERE user_id = ? AND issued > ?').bind(user.id, now - DAY).first<{ n: number }>();
    const room = Math.max(0, PACKS_PER_DAY - (recent?.n ?? 0));
    allowed = fresh.slice(0, room);
    if (fresh.length > room) {
      refused.push(...fresh.slice(room));
      reason = `That's the most new cases and games for one day (${PACKS_PER_DAY}). More open tomorrow.`;
    }
  }
  if (allowed.length)
    await db.batch(allowed.map((id) => db.prepare('INSERT OR IGNORE INTO packs (user_id, pack, issued) VALUES (?, ?, ?)').bind(user.id, id, now)));
  for (const id of [...given, ...allowed]) out[id] = packs.get(id);
  return { packs: out, refused, reason };
}

/**
 * Give the cards for these terms, under the rules at the top of this file.
 * Cards already given come back whatever the allowance. `test` is the area
 * (or 'phase3') whose test the terms are for.
 */
export async function askCards(db: CardsDb, user: CardsUser, ids: unknown, test: unknown, now: number, packIds?: unknown): Promise<CardsReply> {
  await seedOnce(db, user, now);
  const asked = await askPacks(db, user, packIds, now);
  const { cards, phase3, core, version } = content();
  const wanted = [...new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string' && cards.has(x)) : [])].slice(0, 400);
  const testArea = typeof test === 'string' && core.has(test) ? test : null;
  const given = new Set<string>();
  if (wanted.length) {
    const { results } = await db
      .prepare(`SELECT term_id FROM cards WHERE user_id = ? AND term_id IN (${wanted.map(() => '?').join(', ')})`)
      .bind(user.id, ...wanted)
      .all<{ term_id: string }>();
    for (const r of results) given.add(r.term_id);
  }
  const refused: string[] = [];
  let reason: string | undefined;
  const allowed: string[] = [];
  const admin = !!user.admin;
  for (const id of wanted) {
    if (given.has(id)) continue;
    if (phase3.has(id) && !user.phase3 && !admin) {
      refused.push(id);
      reason = 'Phase 3 terms open once phase 3 is unlocked on your account.';
    } else allowed.push(id);
  }

  let fresh: string[] = [];
  let tag: string | null = null;
  if (admin) fresh = allowed;
  else if (testArea) {
    const inTest = allowed.filter((id) => core.get(testArea)!.has(id));
    for (const id of allowed) if (!inTest.includes(id)) refused.push(id);
    if (inTest.length) {
      const tests = await db
        .prepare('SELECT COUNT(DISTINCT test) AS n FROM cards WHERE user_id = ? AND issued > ? AND test IS NOT NULL AND test != ? AND test != ?')
        .bind(user.id, now - DAY, 'seed', testArea)
        .first<{ n: number }>();
      if ((tests?.n ?? 0) >= TESTS_PER_DAY) {
        refused.push(...inTest);
        reason = `That's ${TESTS_PER_DAY} area tests started today. Try this one tomorrow.`;
      } else {
        fresh = inTest;
        tag = testArea;
      }
    }
  } else if (allowed.length) {
    const recent = await db
      .prepare('SELECT COUNT(*) AS n FROM cards WHERE user_id = ? AND issued > ? AND test IS NULL')
      .bind(user.id, now - DAY)
      .first<{ n: number }>();
    const room = Math.max(0, NEW_PER_DAY - (recent?.n ?? 0));
    fresh = allowed.slice(0, room);
    if (allowed.length > room) {
      refused.push(...allowed.slice(room));
      reason = `That's the most new terms for one day (${NEW_PER_DAY}). More open tomorrow; reviews and practice carry on as normal.`;
    }
  }
  if (fresh.length) await db.batch(issue(db, user.id, fresh, now, tag));

  const out: Record<string, Card> = {};
  for (const id of [...given, ...fresh]) out[id] = cards.get(id)!;
  refused.push(...asked.refused);
  reason ??= asked.reason;
  return { version, at: now, cards: out, packs: asked.packs, ...(refused.length ? { refused, reason } : {}) };
}
