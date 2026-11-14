/**
 * Lessons, practice rounds, area tests and mode rounds are built by the server (worker/session.ts):
 * the app says which kind it wants and sends the learner's progress, and gets the questions
 * without their answers, plus the cards of the terms it teaches. Each pick is sent back with the
 * question's sealed token, and only then do the right answer and the reason come.
 * `npm run dev` has no server, so there the same code runs in the page, never in the production build.
 */
import type { DealtPlan, DealtQuestion } from '../../worker/session';
import { applyCards } from './content';
import { call } from './modes/roundApi';
import type { Sum } from './mock';
import type { Card, Progress } from './types';

export type { DealtPlan, DealtQuestion };
/** A question the learner answers by picking one option. */
export type PickQuestion = Exclude<DealtQuestion, { kind: 'intro' } | { kind: 'match' }>;

/** Which session to build. */
export type Recipe =
  | { build: 'lesson'; keepGoing: boolean; listen: boolean }
  | { build: 'weak' }
  | { build: 'practice'; unitId: string }
  | { build: 'test'; categoryId: string }
  | { build: 'defend'; termIds: string[] }
  | { build: 'rally'; areaId: string }
  | { build: 'listing' }
  | { build: 'revisit'; lineId: string }
  | { build: 'ride'; lineId: string; from: number };

/** What a pick's mark gives back. */
export interface Marked {
  /** The right option's index, as dealt. */
  answer: number;
  why?: string;
  /** For a fill question: the words the gap stands for. */
  blank?: string;
}

let devKey: Promise<CryptoKey> | null = null;
async function dev() {
  const s = await import('../../worker/session');
  devKey ??= s.importKey(s.newKeyBytes());
  return { s, key: await devKey };
}

/** Build a session. Null when there is nothing to do. The cards of the terms it teaches are put where the app reads them. */
export async function startSession(recipe: Recipe, progress: Progress, today: string): Promise<DealtPlan | null> {
  let out: { plan: DealtPlan | null; cards: Record<string, Card> };
  if (import.meta.env.DEV) {
    const { s, key } = await dev();
    const seed = Date.now() % 2_147_483_647;
    const plan = s.buildSession(recipe, progress, today, seed);
    if (plan && 'error' in plan) throw new Error(plan.error);
    out = plan ? await s.dealSession(key, 0, plan, progress, seed) : { plan: null, cards: {} };
  } else out = await call('session', { recipe, progress, today });
  applyCards(out.cards);
  return out.plan;
}

/** Mark a pick: the right option, the reason, and the term's card (put where the feedback reads it). */
export async function markPick(q: Pick<PickQuestion, 'termId' | 'token'>): Promise<Marked> {
  let out: Marked & { card?: Card };
  if (import.meta.env.DEV) {
    const { s, key } = await dev();
    const r = await s.markAnswer(key, 0, { token: q.token });
    if ('error' in r) throw new Error(String(r.error));
    out = r as unknown as Marked & { card?: Card };
  } else out = await call('mark', { token: q.token });
  if (out.card) applyCards({ [q.termId]: out.card });
  return { answer: out.answer, why: out.why, blank: out.blank };
}

/** Check one pair of a match: the term at `left` against the meaning at `right`. */
export async function markPair(token: string, left: number, right: number): Promise<boolean> {
  if (import.meta.env.DEV) {
    const { s, key } = await dev();
    const r = await s.markAnswer(key, 0, { token, pair: [left, right] });
    if ('error' in r) throw new Error(String(r.error));
    return !!r.correct;
  }
  return (await call<{ correct: boolean }>('mark', { token, pair: [left, right] })).correct;
}

/** A mock round's worked sums: from the learner's met terms, sealed until the round is marked. */
export async function dealSums(round: string, progress: Progress): Promise<Sum[]> {
  if (import.meta.env.DEV) {
    const { s, key } = await dev();
    return s.dealSums(key, 0, s.mockSumTerms(round, progress) ?? [], Date.now() % 2_147_483_647);
  }
  return (await call<{ sums: Sum[] }>('sums', { round, progress })).sums;
}
