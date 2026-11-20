import { isPhase3Area, isPracticeUnit, isQuantArea, path, talkTerms, termById, termIdsOfUnit, unitById, unitLeft, unitSize } from './content';
import { addDays } from './dates';
import { drillPassed } from './drills';
import type { LessonPlan } from './lesson';
import { PHASE3, phase3Open, phase3UnitIds } from './phase3';
import { isDone } from './scheduler';
import { calcQuestion, fillQuestion, matchQuestion, meaningQuestion, shuffle, talkAbout, talkQuestion, termQuestion, tfQuestion, type Rng } from './questions';
import type { Progress, Question, Term, TermState } from './types';

/** Share of an area test that has to be right to open the area's advanced units. */
export const TEST_PASS = 0.8;
/** Terms in one practice round. */
export const PRACTICE_TERMS = 8;

const pathIndex = new Map(path.map((r, i) => [r.unit.id, i]));

const coreRows = (categoryId: string) => path.filter((r) => r.pass === 1 && r.category.id === categoryId);

/** An area's core terms, in teaching order. Only the known ones: the Worker knows them all. */
export function areaCoreTermIds(categoryId: string): string[] {
  return coreRows(categoryId).flatMap((r) => r.terms.map((t) => t.id));
}

/** How many core terms an area has. */
export function areaCoreSize(categoryId: string): number {
  return coreRows(categoryId).reduce((n, r) => n + unitSize(r.unit.id), 0);
}

/** An area's core practice units (drills, games, cases), in path order. */
export function areaCoreDrillIds(categoryId: string): string[] {
  return path.filter((r) => r.pass === 1 && r.category.id === categoryId && isPracticeUnit(r.unit.id)).map((r) => r.unit.id);
}

/**
 * An area's advanced units open once all its core terms are met and its core
 * drills and games passed, once its test is passed, or (for quant areas) with the quant switch.
 * Phase 3 areas open only with the password and the readiness test. The admin's `openAll` opens every area.
 */
export function areaOpen(p: Progress, categoryId: string): boolean {
  if (p.settings?.openAll) return true;
  if (isPhase3Area(categoryId)) return phase3Open(p);
  if (p.unlocked?.includes(categoryId)) return true;
  if (p.settings.quantFirst && isQuantArea(categoryId)) return true;
  return coreRows(categoryId).every((r) => unitLeft(p, r.unit.id) === 0) && areaCoreDrillIds(categoryId).every((id) => drillPassed(p, id));
}

/**
 * Progress as this account should see it. The admin starts with everything open (`openAll`)
 * and keeps whatever they set after that; on any other account the switch is taken off,
 * so it can't come over from a backup or another browser.
 */
export function withAccountView(p: Progress, admin: boolean): Progress {
  if (admin && p.settings.openAll === undefined) return { ...p, settings: { ...p.settings, openAll: true } };
  if (!admin && p.settings.openAll !== undefined) {
    const settings = { ...p.settings };
    delete settings.openAll;
    return { ...p, settings };
  }
  return p;
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
  if (unitLeft(p, unitId) === 0) return [];
  const idx = pathIndex.get(unitId)!;
  const area = path[idx].category.id;
  return path
    .slice(0, idx + 1)
    .filter((r) => r.category.id === area)
    .flatMap((r) => r.terms.map((t) => t.id))
    .filter((id) => !p.terms[id]);
}

/** How many terms a pick of this unit would teach (the length of `focusQueue`), counted without listing them. */
export function focusLeft(p: Progress, unitId = p.focus): number {
  if (!unitId || !unitOpen(p, unitId) || unitLeft(p, unitId) === 0) return 0;
  const idx = pathIndex.get(unitId)!;
  const area = path[idx].category.id;
  return path
    .slice(0, idx + 1)
    .filter((r) => r.category.id === area)
    .reduce((n, r) => n + unitLeft(p, r.unit.id), 0);
}

/** True while the picked unit still has something to do: terms to meet, or a drill, game or case to pass. */
export function focusActive(p: Progress): boolean {
  if (!p.focus || !unitOpen(p, p.focus)) return false;
  return isPracticeUnit(p.focus) ? !drillPassed(p, p.focus) : unitLeft(p, p.focus) > 0;
}

/** True when a unit still has terms to meet, or is a drill, game or case not yet passed. */
function hasWork(p: Progress, unitId: string): boolean {
  return isPracticeUnit(unitId) ? !drillPassed(p, unitId) : unitLeft(p, unitId) > 0;
}

/** The first phase 3 unit with work left, once phase 3 is open. */
export function nextPhase3Unit(p: Progress): string | null {
  if (!phase3Open(p)) return null;
  return phase3UnitIds.find((id) => hasWork(p, id)) ?? null;
}

/**
 * Drop a pick once its unit has been fully met (or its practice unit passed).
 * A pick inside phase 3 moves on to the next strategy unit instead, so a
 * learner who chose the strategies stays on them.
 */
export function settleFocus(p: Progress): Progress {
  if (!p.focus || focusActive(p)) return p;
  const inPhase3 = phase3UnitIds.includes(p.focus);
  return withFocus(p, (inPhase3 && nextPhase3Unit(p)) || null);
}

/** Set or clear the picked unit. A cleared pick is kept as null: dropping the key would let the other copy's pick win the next merge. */
export function withFocus(p: Progress, unitId: string | null): Progress {
  return { ...p, focus: unitId };
}

function termsOf(ids: string[]): Term[] {
  return ids.map((id) => termById.get(id)).filter((t): t is Term => !!t);
}

/**
 * A practice round on a unit's met terms, weakest first. Every question is
 * practice, so the review schedule does not move.
 */
export function buildPractice(p: Progress, unitId: string, rng: Rng): LessonPlan | null {
  // Done easy terms stay out: they never come back (src/lib/easy.ts).
  const met = termIdsOfUnit(unitId).filter((id) => p.terms[id] && !isDone(p.terms[id]));
  if (met.length < 2) return null;
  const weakest = shuffle(met, rng)
    .sort((a, b) => p.terms[a].step - p.terms[b].step || p.terms[b].lapses - p.terms[a].lapses)
    .slice(0, PRACTICE_TERMS);
  return { ...buildPracticeOn(p, weakest, rng), unitId };
}

/** A practice round on the given met terms: mixed question types, a matching round, a worked sum or two, and desk talk. */
export function buildPracticeOn(p: Progress, weakest: string[], rng: Rng): LessonPlan {
  const met = weakest;
  const known = new Set(Object.keys(p.terms));
  const picked = shuffle(termsOf(weakest), rng);
  const ask = [(t: Term) => termQuestion(t, rng, false, known), (t: Term) => fillQuestion(t, rng, false, known), (t: Term) => meaningQuestion(t, rng)];
  const qs: Question[] = picked.map((t, i) => ask[i % ask.length](t));
  if (picked.length >= 4) qs.splice(Math.ceil(qs.length / 2), 0, matchQuestion(picked.slice(0, 5), rng));
  const apply = picked.map((t) => calcQuestion(t, rng) ?? tfQuestion(t, rng)).filter((q): q is Question => !!q);
  qs.push(...apply.slice(0, 2));
  // Desk talk on this unit's terms, when an item fits what the learner has met.
  const talk = talkAbout(met, known, rng);
  if (talk && talkTerms(talk).some((id) => met.includes(id))) qs.push(talkQuestion(talk, rng));
  return { kind: 'practice', newIds: [], reviewIds: [], questions: qs };
}

/** The test can be taken when the area is still locked and not already tried today. */
export function canTakeTest(p: Progress, categoryId: string, today: string): boolean {
  // Areas made only of drills have no test: passing the core drills opens them.
  return areaCoreSize(categoryId) > 0 && !areaOpen(p, categoryId) && p.tests?.[categoryId]?.date !== today;
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
  const next: Progress = {
    ...p,
    terms,
    unlocked: passed ? [...new Set([...(p.unlocked ?? []), categoryId])] : p.unlocked,
    tests: { ...(p.tests ?? {}), [categoryId]: { date: today, right: rightIds.length, total, passed } },
  };
  // Passing the readiness test makes the first strategy unit the learner's pick.
  if (categoryId === PHASE3 && passed && !focusActive(next)) {
    const first = nextPhase3Unit(next);
    if (first) return withFocus(next, first);
  }
  return next;
}
