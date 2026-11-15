import { focusQueue } from './choose';
import { isPracticeUnit, termById } from './content';
import { reachableCount } from './phase3';
import { calcQuestion, fillQuestion, listenQuestion, matchQuestion, meaningQuestion, reviewQuestion, shuffle, talkAbout, talkQuestion, termQuestion, tfQuestion, type Rng } from './questions';
import { dayStats, dueTermIds, newLeftToday, reviewsLeftToday } from './scheduler';
import { canSpeak } from './speech';
import { currentUnit, trackTermIds } from './track';
import type { Progress, Question, Term } from './types';

export const NEW_PER_LESSON = 4;
export const REVIEWS_IN_NEW_LESSON = 4;
export const REVIEWS_PER_REVIEW_LESSON = 12;
/** When this many reviews are waiting, the next lesson clears reviews first. */
export const REVIEW_FIRST_THRESHOLD = 12;

export interface LessonPlan {
  kind: 'new' | 'review' | 'practice' | 'test';
  newIds: string[];
  reviewIds: string[];
  questions: Question[];
  /** The unit a practice round is on. */
  unitId?: string;
  /** The area a test is for. */
  categoryId?: string;
  /** A practice round on the learner's most-missed terms. */
  weak?: boolean;
}

/** Next terms to teach: a picked unit (and what it builds on) first, then the track up to the next drill. */
export function nextNewTermIds(p: Progress, count: number, today = ''): string[] {
  const queue = [...focusQueue(p), ...trackTermIds(p, today, count)];
  return [...new Set(queue)].slice(0, count);
}

/** The practice unit (drill, game or case) to run next, when the learner is on one and reviews are not piling up. */
export function drillUp(p: Progress, today: string): string | null {
  const cur = currentUnit(p, today);
  if (!cur || !isPracticeUnit(cur)) return null;
  const due = Math.min(dueTermIds(p, today).length, reviewsLeftToday(p, today));
  return due >= REVIEW_FIRST_THRESHOLD ? null : cur;
}

export interface TodayStatus {
  due: number;
  newLeft: number;
  newAvailable: number;
  /** True when reviews are heavy (today, or booked for tomorrow) and new terms are held back. */
  slowed: boolean;
  /** The practice unit (drill, game or case) the learner is on, if any. */
  drill: string | null;
}

export function todayStatus(p: Progress, today: string): TodayStatus {
  const due = Math.min(dueTermIds(p, today).length, reviewsLeftToday(p, today));
  const reach = reachableCount(p);
  const newAvailable = reach.total - reach.met;
  const cur = currentUnit(p, today);
  const newLeft = Math.min(newLeftToday(p, today), newAvailable);
  const goalLeft = Math.max(0, p.settings.newPerDay - dayStats(p, today).newTerms);
  return {
    due,
    newLeft,
    newAvailable,
    slowed: newLeft < Math.min(goalLeft, newAvailable),
    drill: cur && isPracticeUnit(cur) ? cur : null,
  };
}

export interface LessonOptions {
  /** Ask some terms by ear. Defaults to on when the voice setting is on and the browser can speak. */
  listen?: boolean;
}

/**
 * Build the next lesson. Reviews come first when many are waiting; otherwise the
 * lesson teaches up to 4 new terms and mixes in up to 4 reviews, so reviews stay
 * at about a third of the session during the core sweep.
 * `ignoreNewCap` lets the learner keep going after the daily goal.
 */
export function buildLesson(p: Progress, today: string, rng: Rng, ignoreNewCap = false, opts: LessonOptions = {}): LessonPlan | null {
  const listen = opts.listen ?? (p.settings.voice && canSpeak());
  const due = dueTermIds(p, today).slice(0, reviewsLeftToday(p, today));
  const newBudget = ignoreNewCap ? NEW_PER_LESSON : Math.min(NEW_PER_LESSON, newLeftToday(p, today));
  const newIds = nextNewTermIds(p, newBudget, today);

  if (due.length >= REVIEW_FIRST_THRESHOLD || (newIds.length === 0 && due.length > 0)) {
    const reviewIds = due.slice(0, REVIEWS_PER_REVIEW_LESSON);
    return { kind: 'review', newIds: [], reviewIds, questions: reviewLessonQuestions(p, reviewIds, rng, listen) };
  }
  if (newIds.length === 0) return null;
  const reviewIds = due.slice(0, REVIEWS_IN_NEW_LESSON);
  return { kind: 'new', newIds, reviewIds, questions: newLessonQuestions(p, newIds, reviewIds, rng, listen) };
}

function terms(ids: string[]): Term[] {
  return ids.map((id) => termById.get(id)).filter((t): t is Term => !!t);
}

/** Talk items already in a lesson, so the extra one is different. */
function talkIds(qs: Question[]): Set<string> {
  return new Set(qs.flatMap((q) => (q.kind === 'talk' ? [q.itemId] : [])));
}

function reviewLessonQuestions(p: Progress, reviewIds: string[], rng: Rng, listen = false): Question[] {
  const known = new Set(Object.keys(p.terms));
  const qs: Question[] = shuffle(terms(reviewIds), rng).map((t) => reviewQuestion(t, p.terms[t.id]?.step ?? 1, rng, known, listen));
  // A match round in the middle keeps a long review from feeling like flashcards.
  if (reviewIds.length >= 5) {
    const pairs = shuffle(terms(reviewIds), rng).slice(0, 5);
    qs.splice(Math.floor(qs.length / 2), 0, matchQuestion(pairs, rng));
  }
  // One piece of desk talk on terms already met, near the end.
  const talk = talkAbout(reviewIds, known, rng, talkIds(qs));
  if (talk) qs.splice(Math.max(0, qs.length - 2), 0, talkQuestion(talk, rng));
  return qs;
}

/**
 * New-term lesson: each term is introduced, then asked straight away, then asked
 * again the other way round a little later, with reviews mixed in between.
 */
function newLessonQuestions(p: Progress, newIds: string[], reviewIds: string[], rng: Rng, listen = false): Question[] {
  const fresh = terms(newIds);
  const known = new Set([...Object.keys(p.terms), ...newIds]);
  const reviews = terms(reviewIds).map((t) => reviewQuestion(t, p.terms[t.id]?.step ?? 1, rng, known, listen));
  const qs: Question[] = [];
  const takeReview = () => {
    const r = reviews.shift();
    if (r) qs.push(r);
  };

  fresh.forEach((t, i) => {
    qs.push({ kind: 'intro', termId: t.id });
    qs.push(meaningQuestion(t, rng));
    if (i > 0) qs.push(termQuestion(fresh[i - 1], rng, false, known));
    if (i === 1) takeReview();
  });
  const last = fresh[fresh.length - 1];
  if (last) qs.push(termQuestion(last, rng, false, known));
  takeReview();

  // Match pairs needs 4 or 5 terms: the new ones, topped up with known neighbours.
  const pool = [...fresh];
  for (const id of [...reviewIds, ...Object.keys(p.terms)]) {
    if (pool.length >= 5) break;
    const t = termById.get(id);
    if (t && !pool.some((x) => x.id === t.id)) pool.push(t);
  }
  if (pool.length >= 4) qs.push(matchQuestion(pool, rng));
  takeReview();

  // A new term with its own spoken form, asked by ear.
  const heard = listen ? fresh.find((t) => t.said) : undefined;
  if (heard) qs.push(listenQuestion(heard, rng)!);

  // Two fill-the-gap questions on new terms to start using them in sentences.
  for (const t of shuffle(fresh, rng).slice(0, 2)) qs.push(fillQuestion(t, rng, false, known));
  takeReview();

  // Then put the new terms to work: up to two worked sums or true/false checks.
  const apply: Question[] = [];
  for (const t of fresh) {
    const q = calcQuestion(t, rng) ?? tfQuestion(t, rng);
    if (q) apply.push(q);
  }
  for (const q of shuffle(apply, rng).slice(0, 2)) {
    qs.push(q);
    takeReview();
  }

  // Then hear the words in use: one piece of desk talk, on the new terms when one fits.
  const talk = talkAbout(newIds, known, rng, talkIds([...qs, ...reviews]));
  if (talk) qs.push(talkQuestion(talk, rng));
  while (reviews.length) takeReview();
  return qs;
}
