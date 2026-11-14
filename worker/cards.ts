/**
 * Term cards: what each term means, its examples and its questions. The app
 * ships with term names only; this is the one place the rest lives. The app
 * asks for a card only when the learner does something that shows it (starts a
 * lesson, taps a term), keeps it in memory for that session only, and never
 * gets a bulk download.
 *
 * - No daily allowance: learners take as many lessons as they like.
 * - Each ask carries at most MAX_IDS cards and MAX_PACKS packs, and an account
 *   can ask at most ASKS_PER_MINUTE times a minute. No one reaches either by
 *   tapping; a script copying the syllabus hits them at once.
 * - At most NEW_PER_HOUR cards an account has never had before, in any hour.
 *   A lesson teaches a handful of new terms, so learners never meet it.
 * - Phase 3 terms and packs only once the account has phase 3 (the password, or the admin).
 *
 * Packs work the same way: a desk case, or one game or mode's content, given
 * when the learner opens it. The admin has no per-hour ceiling. Every card and
 * pack given is recorded, so the admin sees each account's activity.
 */
import { buildCards, buildPacks, fullCategories } from '../src/lib/cardData';
import type { Card } from '../src/lib/types';

/** Cards in one ask: a lesson needs a few dozen; the phase 3 test's terms are the most at once. */
export const MAX_IDS = 80;
/** Packs in one ask. */
export const MAX_PACKS = 4;
/** Asks an account can make in a minute. */
export const ASKS_PER_MINUTE = 60;
/** Cards an account has never had before, in any hour. */
export const NEW_PER_HOUR = 300;

const MINUTE = 60_000;
const HOUR = 3_600_000;

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
  // Term ids and pack ids ('case:<unit>', and the ':p3' content packs) that need phase 3.
  const phase3 = new Set<string>();
  for (const c of fullCategories) {
    if (c.phase === 3) {
      for (const t of c.terms) phase3.add(t.id);
      for (const u of c.units) phase3.add(`case:${u.id}`);
    }
  }
  for (const id of packs.keys()) if (id.endsWith(':p3')) phase3.add(id);
  return { cards, packs, phase3, version: fingerprint(JSON.stringify([...cards, ...packs])) };
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

export interface CardsReply {
  version: string;
  at: number;
  cards: Record<string, Card>;
  packs: Record<string, unknown>;
  refused?: string[];
  reason?: string;
}

/**
 * Count this ask against the account's minute. Resolves to false when the account
 * has already asked ASKS_PER_MINUTE times this minute (the admin included: no
 * screen needs that many).
 */
export async function countAsk(db: CardsDb, user: CardsUser, now: number): Promise<boolean> {
  const minute = Math.floor(now / MINUTE);
  const row = await db
    .prepare('INSERT INTO asks (user_id, minute, n) VALUES (?, ?, 1) ON CONFLICT (user_id, minute) DO UPDATE SET n = n + 1 RETURNING n')
    .bind(user.id, minute)
    .first<{ n: number }>();
  if (Math.random() < 0.02) await db.prepare('DELETE FROM asks WHERE minute < ?').bind(minute - 60).run();
  return (row?.n ?? 1) <= ASKS_PER_MINUTE;
}

/** Give these packs, under the rules at the top of this file. */
export async function askPacks(db: CardsDb, user: CardsUser, ids: unknown, now: number): Promise<{ packs: Record<string, unknown>; refused: string[]; reason?: string }> {
  const { packs, phase3 } = content();
  const wanted = [...new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string' && packs.has(x)) : [])].slice(0, MAX_PACKS);
  const out: Record<string, unknown> = {};
  const refused: string[] = [];
  let reason: string | undefined;
  const allowed: string[] = [];
  for (const id of wanted) {
    if (phase3.has(id) && !user.phase3 && !user.admin) {
      refused.push(id);
      reason = 'Phase 3 content opens once phase 3 is unlocked on your account.';
    } else allowed.push(id);
  }
  if (allowed.length)
    await db.batch(allowed.map((id) => db.prepare('INSERT OR IGNORE INTO packs (user_id, pack, issued) VALUES (?, ?, ?)').bind(user.id, id, now)));
  for (const id of allowed) out[id] = packs.get(id);
  return { packs: out, refused, reason };
}

/**
 * Give the cards for these terms (and any packs), under the rules at the top of
 * this file. Cards this account has had before always come back; new ones count
 * towards the hour.
 */
export async function askCards(db: CardsDb, user: CardsUser, ids: unknown, now: number, packIds?: unknown): Promise<CardsReply> {
  const { cards, phase3, version } = content();
  const wanted = [...new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string' && cards.has(x)) : [])].slice(0, MAX_IDS);
  const asked = await askPacks(db, user, packIds, now);
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
  for (const id of wanted) {
    if (phase3.has(id) && !user.phase3 && !user.admin) {
      refused.push(id);
      reason = 'Phase 3 terms open once phase 3 is unlocked on your account.';
    } else allowed.push(id);
  }
  const fresh = allowed.filter((id) => !given.has(id));
  let issued = fresh;
  if (!user.admin && fresh.length) {
    const recent = await db.prepare('SELECT COUNT(*) AS n FROM cards WHERE user_id = ? AND issued > ?').bind(user.id, now - HOUR).first<{ n: number }>();
    const room = Math.max(0, NEW_PER_HOUR - (recent?.n ?? 0));
    issued = fresh.slice(0, room);
    if (fresh.length > room) {
      refused.push(...fresh.slice(room));
      reason = 'That is a lot of new terms in one hour. Take a break and try again shortly.';
    }
  }
  if (issued.length) await db.batch(issue(db, user.id, issued, now, null));

  const out: Record<string, Card> = {};
  for (const id of [...allowed.filter((id) => given.has(id)), ...issued]) out[id] = cards.get(id)!;
  refused.push(...asked.refused);
  reason ??= asked.reason;
  return { version, at: now, cards: out, packs: asked.packs, ...(refused.length ? { refused, reason } : {}) };
}
