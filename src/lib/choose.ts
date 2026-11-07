import { isDrillUnit, isQuantArea, path, termById, termIdsOfUnit, unitById } from './content';
import { addDays } from './dates';
import { drillPassed } from './drills';
import type { LessonPlan } from './lesson';
import { calcQuestion, fillQuestion, matchQuestion, meaningQuestion, shuffle, termQuestion, tfQuestion, type Rng } from './questions';
import type { Progress, Question, Term, TermState } from './types';

/** Share of an area test that has to be right to open the area's advanced units. */
export const TEST_PASS = 0.8;
/** Terms in one practice round. */
export const PRACTICE_TERMS = 8;

const pathIndex = new Map(path.map((r, i) => [r.unit.id, i]));

/** An area's core terms, in teaching order. */
export function areaCoreTermIds(categoryId: string): string[] {
  return path.filter((r) => r.pass === 1 && r.category.id === categoryId).flatMap((r) => r.terms.map((t) => t.id));
}

/** An area's core drills, in path order. */
export function areaCoreDrillIds(categoryId: string): string[] {
  return path.filter((r) => r.pass === 1 && r.category.id === categoryId && r.unit.kind === 'drill').map((r) => r.unit.id);
}

/**
 * An area's advanced units open once all its core terms are met and its core
 * drills passed, once its test is passed, or (for quant areas) with the quant switch.
 */
export function areaOpen(p: Progress, categoryId: string): boolean {
  if (p.unlocked?.includes(categoryId)) return true;
  if (p.settings.quantFirst && isQuantArea(categoryId)) return true;
  return areaCoreTermIds(categoryId).every((id) => p.terms[id]) && areaCoreDrillIds(categoryId).every((id) => drillPassed(p, id));
}

/** Core units are always open; advanced units follow their area. */
export function unitOpen(p: Progress, unitId: string): boolean {
  const u = unitById.get(unitId);
  if (!u) return false;
  return u.core || areaOpen(p, u.categoryId);
}

/**
 * New terms to teach for a picked unit: the unmet terms of the earlier units in
 * its area first (they are what it builds on), then the unit itself.
 * Empty when the unit is locked or fully met.
 */
export function focusQueue(p: Progress, unitId = p.focus): string[] {
  if (!unitId || !unitOpen(p, unitId)) return [];
  if (termIdsOfUnit(unitId).every((id) => p.terms[id])) return [];
  const idx = pathIndex.get(unitId)!;
  const area = path[idx].category.id;
  return path
    .slice(0, idx + 1)
    .filter((r) => r.category.id === area)
    .flatMap((r) => r.terms.map((t) => t.id))
    .filter((id) => !p.terms[id]);
}

/** True while the picked unit still has something to do: terms to meet, or a drill to pass. */
export function focusActive(p: Progress): boolean {
  if (!p.focus || !unitOpen(p, p.focus)) return false;
  return isDrillUnit(p.focus) ? !drillPassed(p, p.focus) : focusQueue(p).length > 0;
}

/** Drop a pick once its unit has been fully met (or its drill passed). */
export function settleFocus(p: Progress): Progress {
  if (!p.focus || focusActive(p)) return p;
  return withFocus(p, null);
}

/** Set or clear the picked unit. */
export function withFocus(p: Progress, unitId: string | null): Progress {
  const next = { ...p };
  if (unitId) next.focus = unitId;
  else delete next.focus;
  return next;
}

function termsOf(ids: string[]): Term[] {
  return ids.map((id) => termById.get(id)).filter((t): t is Term => !!t);
}

/**
 * A practice round on a unit's met terms, weakest first. Every question is
 * practice, so the review schedule does not move.
 */
export function buildPractice(p: Progress, unitId: string, rng: Rng): LessonPlan | null {
  const met = termIdsOfUnit(unitId).filter((id) => p.terms[id]);
  if (met.length < 2) return null;
  const weakest = shuffle(met, rng)
    .sort((a, b) => p.terms[a].step - p.terms[b].step || p.terms[b].lapses - p.terms[a].lapses)
    .slice(0, PRACTICE_TERMS);
  const known = new Set(Object.keys(p.terms));
  const picked = shuffle(termsOf(weakest), rng);
  const ask = [(t: Term) => termQuestion(t, rng, false, known), (t: Term) => fillQuestion(t, rng, false, known), (t: Term) => meaningQuestion(t, rng)];
  const qs: Question[] = picked.map((t, i) => ask[i % ask.length](t));
  if (picked.length >= 4) qs.splice(Math.ceil(qs.length / 2), 0, matchQuestion(picked.slice(0, 5), rng));
  const apply = picked.map((t) => calcQuestion(t, rng) ?? tfQuestion(t, rng)).filter((q): q is Question => !!q);
  qs.push(...apply.slice(0, 2));
  return { kind: 'practice', newIds: [], reviewIds: [], questions: qs, unitId };
}

/** The test can be taken when the area is still locked and not already tried today. */
export function canTakeTest(p: Progress, categoryId: string, today: string): boolean {
  // Areas made only of drills have no test: passing the core drills opens them.
  return areaCoreTermIds(categoryId).length > 0 && !areaOpen(p, categoryId) && p.tests?.[categoryId]?.date !== today;
}

/** One question on every core term of the area: pick the term, fill the gap, or a worked sum. */
export function buildTest(categoryId: string, rng: Rng): LessonPlan {
  const picked = shuffle(termsOf(areaCoreTermIds(categoryId)), rng);
  const qs = picked.map((t, i) => (i % 3 === 2 && calcQuestion(t, rng)) || (i % 2 ? fillQuestion(t, rng) : termQuestion(t, rng)));
  return { kind: 'test', newIds: [], reviewIds: [], questions: qs, categoryId };
}

/**
 * Score an area test. Terms answered right that were not yet met count as
 * learned: they join the ladder at step 3 and come back for a check within
 * 4 to 10 days, spread out so they do not all land on one day.
 */
export function applyTest(p: Progress, categoryId: string, rightIds: string[], total: number, today: string): Progress {
  const passed = total > 0 && rightIds.length / total >= TEST_PASS;
  const terms = { ...p.terms };
  rightIds
    .filter((id) => !terms[id])
    .forEach((id, i) => {
      const state: TermState = { step: 3, due: addDays(today, 4 + (i % 7)), seen: 1, correct: 1, wrong: 0, lapses: 0, trouble: false, introduced: today };
      terms[id] = state;
    });
  return {
    ...p,
    terms,
    unlocked: passed ? [...new Set([...(p.unlocked ?? []), categoryId])] : p.unlocked,
    tests: { ...(p.tests ?? {}), [categoryId]: { date: today, right: rightIds.length, total, passed } },
  };
}
