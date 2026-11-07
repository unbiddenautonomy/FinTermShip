/**
 * Practice units on the track: timed drills, trading games and desk cases.
 * They share one record per unit (in `progress.drills`), hold up the path
 * until passed, and can be skipped for a day.
 */
import { caseById, practiceKind } from './content';
import { clock, DRILLS } from './drills';
import { MM, points } from './market';
import type { DrillRecord, PracticeKind, Progress } from './types';

export const KIND_LABEL: Record<PracticeKind, string> = {
  drill: 'timed drill',
  game: 'trading game',
  case: 'desk case',
};

/** Steps in one go at a case: you may miss one and still pass. */
export function casePassMark(unitId: string): number {
  const c = caseById.get(unitId);
  return c ? c.steps.length - 1 : 0;
}

/** What a round of this unit is, e.g. "10 questions" or "9 turns". */
export function roundSize(unitId: string): string {
  const kind = practiceKind(unitId);
  if (kind === 'drill') return `${DRILLS[unitId]?.count ?? 0} questions`;
  if (kind === 'game') return `${MM.turns} turns`;
  if (kind === 'case') return `${caseById.get(unitId)?.steps.length ?? 0} decisions`;
  return '';
}

/** The pass rule, for sheets and the bottom of each screen. */
export function passRule(unitId: string): string {
  const kind = practiceKind(unitId);
  if (kind === 'drill') {
    const spec = DRILLS[unitId];
    return spec ? `pass with ${spec.passRight} right in under ${clock(spec.targetSec * 1000)}` : '';
  }
  if (kind === 'game') return `pass by quoting near fair value, keeping the spread to ${MM.maxWidth} points and ending within ${MM.flatAtEnd} lots of flat`;
  if (kind === 'case') return `pass with ${casePassMark(unitId)} best calls`;
  return '';
}

/** A short description for the unit sheet. */
export function practiceAbout(unitId: string): string {
  const kind = practiceKind(unitId);
  if (kind === 'drill') return DRILLS[unitId]?.about ?? '';
  if (kind === 'game')
    return 'Quote a bid and an ask on the total of three dice while traders deal with you. Some of them already know the next die. Make money from the spread without getting picked off, and keep your position under control.';
  if (kind === 'case') return caseById.get(unitId)?.setup ?? '';
  return '';
}

/** One line on the learner's record, for the path. */
export function recordLine(p: Progress, unitId: string): string {
  const kind = practiceKind(unitId);
  const rec = p.drills?.[unitId];
  if (kind === 'drill') {
    const spec = DRILLS[unitId];
    if (rec?.passed) return rec.bestMs ? `Passed · best ${clock(rec.bestMs)}` : 'Passed';
    if (rec) return `Best ${rec.bestRight}/${spec?.count}`;
    return `${spec?.count ?? ''}-question drill`;
  }
  if (kind === 'game') {
    if (rec?.passed) return rec.best !== undefined ? `Passed · best ${points(rec.best)} pts` : 'Passed';
    if (rec) return `${rec.rounds} game${rec.rounds === 1 ? '' : 's'} played`;
    return 'Trading game';
  }
  if (kind === 'case') {
    const steps = caseById.get(unitId)?.steps.length ?? 0;
    if (rec?.passed) return `Passed · ${rec.bestRight}/${steps}`;
    if (rec) return `Best ${rec.bestRight}/${steps}`;
    return `Desk case, ${steps} decisions`;
  }
  return '';
}

/** Record one go at a game or case. `score` is checks met or best calls; `best` is a game's profit. */
export function recordRound(p: Progress, unitId: string, score: number, passed: boolean, today: string, best?: number): Progress {
  const r: DrillRecord = p.drills?.[unitId] ?? { rounds: 0, passed: false, bestRight: 0, last: today };
  const next: DrillRecord = {
    ...r,
    rounds: r.rounds + 1,
    last: today,
    passed: r.passed || passed,
    bestRight: Math.max(r.bestRight, score),
  };
  if (best !== undefined) next.best = Math.max(r.best ?? best, best);
  if (next.passed) delete next.snoozed;
  return { ...p, drills: { ...p.drills, [unitId]: next } };
}
