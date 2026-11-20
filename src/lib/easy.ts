/**
 * Everyday terms (lakh, crore, P&L, NSE and the like, marked `easy` in src/data/terms) shouldn't
 * keep coming back the way a hard term does.
 *
 * - Before the first lesson the learner is offered the easy-terms quiz: one quick question on
 *   each, in rounds of EASY_ROUND. A term answered right is done straight away: known at the top
 *   step, never due again, and left out of practice, Call It decks and Term Lines rides. It stays
 *   in the glossary.
 * - A term missed in the quiz, or met without it (the quiz skipped, or met before it existed), is
 *   taught and reviewed as usual, but only EASY_REVIEWS more reviews, right or wrong. Then it is
 *   done too.
 * - A learner who had already started gets the quiz once, from Home. Skipping it counts as taking it.
 */
import { isEasy, pathTermIds, termById } from './content';
import type { LessonPlan } from './lesson';
import { meaningQuestion, shuffle, type Rng } from './questions';
import { isDone, markDone } from './scheduler';
import type { Progress, TermState } from './types';

/** Questions in one round of the quiz: 63 terms make rounds of 22, 22 and 19, so a short round shows the last. */
export const EASY_ROUND = 22;
/** Reviews an easy term gets once it is learned the usual way, before it is done. */
export const EASY_REVIEWS = 2;
/** The quiz's id where an area test's would go (LessonPlan.categoryId). */
export const EASY_QUIZ = 'easy-quiz';

/** Whether the quiz is still on offer: not finished or skipped. */
export function wantsEasyQuiz(p: Progress): boolean {
  return !p.easyQuiz?.done;
}

/** Easy terms the quiz has still to ask, in the order the path teaches them. Only the Worker (and `npm run dev`) knows every term. */
export function easyLeft(p: Progress): string[] {
  const missed = new Set(p.easyQuiz?.missed ?? []);
  return pathTermIds().filter((id) => isEasy(id) && !missed.has(id) && !isDone(p.terms[id]));
}

/** The next round of the quiz: one "what does it mean?" question per term. Null when nothing is left. */
export function buildEasyQuiz(p: Progress, rng: Rng): LessonPlan | null {
  const ids = easyLeft(p).slice(0, EASY_ROUND);
  if (!ids.length) return null;
  const questions = shuffle(ids, rng).map((id) => meaningQuestion(termById.get(id)!, rng));
  return { kind: 'test', newIds: [], reviewIds: [], questions, categoryId: EASY_QUIZ };
}

/**
 * Score a round. Right answers are done: a term not met yet joins the ladder already done. Missed
 * ones are remembered so the next round skips them, and are taught as usual. `last` finishes the quiz.
 */
export function applyEasyQuiz(p: Progress, askedIds: string[], rightIds: string[], today: string, last: boolean): Progress {
  const right = new Set(rightIds);
  const terms = { ...p.terms };
  for (const id of askedIds.filter((x) => right.has(x))) {
    const s: TermState = terms[id] ?? { step: 0, due: today, seen: 0, correct: 0, wrong: 0, lapses: 0, trouble: false, introduced: today };
    terms[id] = markDone({ ...s, seen: s.seen + 1, correct: s.correct + 1 }, today);
  }
  const missed = [...new Set([...(p.easyQuiz?.missed ?? []), ...askedIds.filter((x) => !right.has(x))])].sort();
  return { ...p, terms, easyQuiz: { missed, ...(last ? { done: today } : p.easyQuiz?.done ? { done: p.easyQuiz.done } : {}) } };
}

/** Skip the quiz: it isn't offered again, and easy terms are taught as usual (each with EASY_REVIEWS reviews). */
export function skipEasyQuiz(p: Progress, today: string): Progress {
  return { ...p, easyQuiz: { missed: p.easyQuiz?.missed ?? [], done: today } };
}

/**
 * After a scheduled review of an easy term: one review fewer left, and done once none are.
 * Other terms are left as they are.
 */
export function afterEasyReview(p: Progress, termId: string, today: string): Progress {
  const s = p.terms[termId];
  if (!s || !isEasy(termId) || isDone(s)) return p;
  // The review already happened: `s` is the term after it, so count it off.
  const left = (s.easy ?? EASY_REVIEWS) - 1;
  const next = left <= 0 ? markDone(s, today) : { ...s, easy: left };
  return { ...p, terms: { ...p.terms, [termId]: next } };
}
