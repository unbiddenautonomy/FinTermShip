/**
 * Term cards: what each term means, its examples and its questions. The app
 * ships with term names only; this is the one place the rest lives. The app
 * asks for a card only when the learner does something that shows it (starts a
 * lesson, taps a term), keeps it in memory for that session only, and never
 * gets a bulk download.
 *
 * - No daily allowance: learners take as many lessons as they like.
 * - Each ask carries at most MAX_IDS cards, and an account
 *   can ask at most ASKS_PER_MINUTE times a minute. No one reaches either by
 *   tapping; a script copying the syllabus hits them at once.
 * - At most NEW_PER_HOUR cards an account has never had before, in any hour.
 *   A lesson teaches a handful of new terms, so learners never meet it.
 * - Phase 3 terms only once the account has phase 3 (the password, or the admin).
 *
 * The admin has no per-hour ceiling. Every card given is recorded, so the admin
 * sees each account's activity.
 *
 * Packs (desk cases, game content, headlines and boards) are never given whole.
 * They stay here, and one round at a time is dealt without its answers
 * (worker/practice.ts, worker/rounds.ts, worker/callit.ts).
 */
import { buildCards, buildPacks, fullCategories } from '../src/lib/cardData';
import { TEACH_FIELDS, type Card } from '../src/lib/types';

/** Cards in one ask: a lesson needs a few dozen; the phase 3 test's terms are the most at once. */
export const MAX_IDS = 80;
/** Asks an account can make in a minute. */
export const ASKS_PER_MINUTE = 120;
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

/**
 * Let this account have these terms, under the rules at the top of this file: phase 3 terms only
 * with phase 3, and at most NEW_PER_HOUR it has never had before in any hour. Terms it has had
 * before are always allowed. What is allowed is recorded as given.
 */
export async function grant(db: CardsDb, user: CardsUser, ids: string[], now: number): Promise<{ allowed: string[]; refused: string[]; reason?: string }> {
  const { cards, phase3 } = content();
  const wanted = [...new Set(ids)].filter((id) => cards.has(id));
  const given = new Set<string>();
  for (let i = 0; i < wanted.length; i += 90) {
    const chunk = wanted.slice(i, i + 90);
    const { results } = await db
      .prepare(`SELECT term_id FROM cards WHERE user_id = ? AND term_id IN (${chunk.map(() => '?').join(', ')})`)
      .bind(user.id, ...chunk)
      .all<{ term_id: string }>();
    for (const r of results) given.add(r.term_id);
  }
  const refused: string[] = [];
  let reason: string | undefined;
  const open: string[] = [];
  for (const id of wanted) {
    if (phase3.has(id) && !user.phase3 && !user.admin) {
      refused.push(id);
      reason = 'Phase 3 terms open once phase 3 is unlocked on your account.';
    } else open.push(id);
  }
  const fresh = open.filter((id) => !given.has(id));
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
  const ok = new Set(issued);
  return { allowed: open.filter((id) => given.has(id) || ok.has(id)), refused, reason };
}

/** A card as the app gets it: what the term means and how it is used, without the material its questions are made from. */
export function teachingCard(id: string): Card | undefined {
  const c = content().cards.get(id);
  if (!c) return undefined;
  const out: Record<string, unknown> = {};
  for (const f of TEACH_FIELDS) if (c[f] !== undefined) out[f] = c[f];
  return out as unknown as Card;
}

/**
 * Give the cards for these terms, under the rules at the top of this file. Cards this account
 * has had before always come back; new ones count towards the hour.
 */
export async function askCards(db: CardsDb, user: CardsUser, ids: unknown, now: number): Promise<CardsReply> {
  const { cards, version } = content();
  const wanted = [...new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string' && cards.has(x)) : [])].slice(0, MAX_IDS);
  const { allowed, refused, reason } = await grant(db, user, wanted, now);
  const out: Record<string, Card> = {};
  for (const id of allowed) out[id] = cards.get(id)!;
  return { version, at: now, cards: out, ...(refused.length ? { refused, reason } : {}) };
}
