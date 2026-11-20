import { termById } from './content';
import { buildPracticeOn } from './choose';
import type { LessonPlan } from './lesson';
import type { Rng } from './questions';
import { isDone } from './scheduler';
import type { Progress, TermState } from './types';

/** Terms in one weak-spots round. */
export const WEAK_TERMS = 8;
/** The home card shows once this many terms count as weak. */
export const WEAK_MIN = 3;

/** How often a term is missed, counting every answer on it. */
export const missRate = (s: TermState) => (s.correct + s.wrong ? s.wrong / (s.correct + s.wrong) : 0);

/** A term is weak when it is marked trouble, has slipped down the ladder, or is missed a quarter of the time or more. */
export function isWeak(s: TermState): boolean {
  return s.wrong > 0 && (s.trouble || s.lapses > 0 || missRate(s) >= 0.25);
}

/** The learner's most-missed terms, worst first. */
export function weakSpots(p: Progress, limit = WEAK_TERMS): string[] {
  return Object.entries(p.terms)
    .filter(([id, s]) => termById.has(id) && isWeak(s) && !isDone(s))
    .sort(([, a], [, b]) => Number(b.trouble) - Number(a.trouble) || missRate(b) - missRate(a) || b.lapses - a.lapses || b.wrong - a.wrong)
    .slice(0, limit)
    .map(([id]) => id);
}

/** A practice round on the weakest terms. It doesn't move the review schedule, but right answers count, so terms leave the list as they improve. */
export function buildWeakSpots(p: Progress, rng: Rng): LessonPlan | null {
  const ids = weakSpots(p);
  if (ids.length < 2) return null;
  return { ...buildPracticeOn(p, ids, rng), weak: true };
}
