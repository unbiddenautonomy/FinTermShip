/**
 * Term names. The app ships with the syllabus's skeleton only: areas, units and how many terms
 * each unit has (src/data/skeleton.json). It learns a term's name, unit and mix-ups here, and only
 * for a term the learner has reached, or one a screen in front of them shows (a lesson's options,
 * a board's tiles, a case's terms). So the app's files, and what it holds, never list the syllabus.
 */
import { allStubs } from '../src/lib/syllabus';
import { fullCategories } from '../src/lib/cardData';
import { answer, type Reply } from '../src/lib/guide';
import { newProgress } from '../src/lib/scheduler';
import type { Progress, TermStub } from '../src/lib/types';
import { grant, type CardsDb, type CardsUser } from './cards';

const stubById = new Map(allStubs.map((s) => [s.id, s]));

export function isTermId(id: unknown): id is string {
  return typeof id === 'string' && stubById.has(id);
}

/** These terms as the app gets them. Their mix-ups list only terms in `reached`, so a stub never names a term the learner hasn't seen. */
export function stubsFor(ids: Iterable<string>, reached: Set<string>): TermStub[] {
  const out: TermStub[] = [];
  for (const id of new Set(ids)) {
    const s = stubById.get(id);
    if (!s) continue;
    out.push({ ...s, confusables: s.confusables.filter((x) => reached.has(x)), ...(s.near ? { near: s.near.filter((x) => reached.has(x)) } : {}) });
  }
  return out;
}

// Fields of a reply that hold term ids.
const TERM_KEYS = new Set(['term', 'terms', 'termId', 'termIds', 'tiles', 'newIds', 'reviewIds']);

/** Every term id a reply names, in the fields that hold them, at any depth. */
export function termIdsIn(value: unknown, out = new Set<string>(), key = ''): Set<string> {
  if (typeof value === 'string') {
    if (TERM_KEYS.has(key) && stubById.has(value)) out.add(value);
  } else if (Array.isArray(value)) {
    for (const v of value) termIdsIn(v, out, key);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) termIdsIn(v, out, k);
  }
  return out;
}

/**
 * Add the names of the terms a reply shows, so the app can draw them. `alsoReached` are terms
 * the learner has reached besides these, for their mix-ups.
 */
export function withTerms<T extends object>(reply: T, alsoReached: Iterable<string> = []): T & { terms?: TermStub[] } {
  const ids = termIdsIn(reply);
  return ids.size ? { ...reply, terms: stubsFor(ids, new Set([...ids, ...alsoReached])) } : reply;
}

/**
 * Every term this account has reached: each one a lesson, test or round has used (recorded as
 * given), and each one met in its saved progress (an account from before terms were recorded,
 * or progress from another device). A term met only in the saved progress is recorded now, so
 * the admin sees it, under the phase 3 rule but not the hourly ceiling: a learner coming back
 * with hundreds of met terms gets their whole path at once. Progress can only name a term by
 * its id, and the app no longer has the ids of terms the learner hasn't reached.
 */
export async function reachedTerms(db: CardsDb, user: CardsUser, now: number): Promise<{ ids: Set<string>; reason?: string }> {
  const { results } = await db.prepare('SELECT term_id FROM cards WHERE user_id = ?').bind(user.id).all<{ term_id: string }>();
  const ids = new Set(results.map((r) => r.term_id).filter(isTermId));
  const row = await db.prepare('SELECT data FROM progress WHERE user_id = ?').bind(user.id).first<{ data: string }>();
  let met: string[] = [];
  try {
    met = Object.keys((JSON.parse(row?.data ?? '{}') as { terms?: Record<string, unknown> }).terms ?? {}).filter((id) => isTermId(id) && !ids.has(id));
  } catch {
    // Unreadable progress: nothing more is reached.
  }
  if (!met.length) return { ids };
  const { allowed, reason } = await grant(db, user, met, now, false);
  for (const id of allowed) ids.add(id);
  return { ids, reason };
}

/** The names of every term this account has reached, for the path, the glossary and the counts. */
export async function askTerms(db: CardsDb, user: CardsUser, now: number): Promise<{ terms: TermStub[]; reason?: string }> {
  const { ids, reason } = await reachedTerms(db, user, now);
  return { terms: stubsFor(ids, ids), ...(reason ? { reason } : {}) };
}

// ---------- Finding a term not yet reached ----------

/** Names one search gives back. */
export const SEARCH_RESULTS = 8;
/** Letters a search needs: one or two letters would page through the list. */
export const SEARCH_MIN = 3;
/** Searches and guide questions an account can make in a day. No learner comes close; copying the list through search would take weeks. */
export const SEARCHES_PER_DAY = 300;

const DAY = 86_400_000;
const phase3Terms = new Set(fullCategories.filter((c) => c.phase === 3).flatMap((c) => c.terms.map((t) => t.id)));

/** Count a search against the account's day. False once it has searched SEARCHES_PER_DAY times today (the admin has no limit). */
export async function countSearch(db: CardsDb, user: CardsUser, now: number): Promise<boolean> {
  if (user.admin) return true;
  const day = Math.floor(now / DAY);
  const row = await db
    .prepare('INSERT INTO searches (user_id, day, n) VALUES (?, ?, 1) ON CONFLICT (user_id, day) DO UPDATE SET n = n + 1 RETURNING n')
    .bind(user.id, day)
    .first<{ n: number }>();
  if (Math.random() < 0.02) await db.prepare('DELETE FROM searches WHERE day < ?').bind(day - 7).run();
  return (row?.n ?? 1) <= SEARCHES_PER_DAY;
}

const canSee = (user: CardsUser, id: string) => !phase3Terms.has(id) || !!user.phase3 || !!user.admin;
const lower = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Terms whose name or alias holds what was typed, best first: the whole name, then names that
 * start with it, then a word that starts with it, then anywhere. At most SEARCH_RESULTS, and
 * nothing for fewer than SEARCH_MIN letters. Phase 3 terms only with phase 3.
 */
export function searchTerms(user: CardsUser, q: unknown): { terms: TermStub[]; more?: boolean } {
  const text = typeof q === 'string' ? lower(q).slice(0, 60) : '';
  if (text.replace(/[^a-z0-9]/g, '').length < SEARCH_MIN) return { terms: [] };
  const rank = (name: string) => {
    const n = lower(name);
    if (n === text) return 0;
    if (n.startsWith(text)) return 1;
    if (n.includes(` ${text}`) || n.includes(`-${text}`)) return 2;
    return n.includes(text) ? 3 : 9;
  };
  const hits = allStubs
    .filter((s) => canSee(user, s.id))
    .map((s) => ({ s, r: Math.min(rank(s.term), ...(s.aliases ?? []).map(rank)) }))
    .filter((h) => h.r < 9)
    .sort((a, b) => a.r - b.r || a.s.term.length - b.s.term.length || a.s.term.localeCompare(b.s.term));
  const ids = hits.slice(0, SEARCH_RESULTS).map((h) => h.s.id);
  return { terms: stubsFor(ids, new Set(ids)), ...(hits.length > SEARCH_RESULTS ? { more: true } : {}) };
}

/**
 * The Guide's answer to one message, worked out here where every term is known: the app's
 * Guide only knows the terms the learner has reached. Comes with the names of the terms the
 * answer shows. Phase 3 terms are named only with phase 3.
 */
export function askGuide(user: CardsUser, text: unknown, progress: unknown): { reply: Reply; terms: TermStub[] } {
  const p = progress && typeof progress === 'object' && (progress as Progress).terms && (progress as Progress).settings ? (progress as Progress) : newProgress();
  const reply = answer(typeof text === 'string' ? text.slice(0, 300) : '', p);
  const ids = termIdsIn(reply);
  if (reply.kind === 'choices') for (const o of reply.options) if (o.target.kind === 'term') ids.add(o.target.id);
  const shown = [...ids].filter((id) => canSee(user, id));
  return { reply, terms: stubsFor(shown, new Set([...shown, ...Object.keys(p.terms)])) };
}
