/**
 * Term names. The app ships with the syllabus's skeleton only: areas, units and how many terms
 * each unit has (src/data/skeleton.json). It learns a term's name, unit and mix-ups here, and only
 * for a term the learner has reached, or one a screen in front of them shows (a lesson's options,
 * a board's tiles, a case's terms). So the app's files, and what it holds, never list the syllabus.
 */
import { allStubs } from '../src/lib/syllabus';
import type { TermStub } from '../src/lib/types';
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
