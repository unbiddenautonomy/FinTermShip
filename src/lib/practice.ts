/**
 * Practice units on the track: timed drills, games and desk cases.
 * They share one record per unit (in `progress.drills`), hold up the path
 * until passed, and can be skipped for a day.
 */
import { settleFocus } from './choose';
import { caseSummary, practiceKind } from './content';
import { clock, DRILLS } from './drills';
import { gameSpec } from './games';
import { finishLesson } from './scheduler';
import type { DrillRecord, PracticeKind, Progress } from './types';

export const KIND_LABEL: Record<PracticeKind, string> = {
  drill: 'timed drill',
  game: 'game',
  case: 'desk case',
};

/** Steps in one go at a case: you may miss one and still pass. */
export function casePassMark(unitId: string): number {
  const steps = caseSummary.get(unitId)?.steps ?? 0;
  return steps ? steps - 1 : 0;
}

/** What a round of this unit is, e.g. "10 questions" or "9 turns". */
export function roundSize(unitId: string): string {
  const kind = practiceKind(unitId);
  if (kind === 'drill') return `${DRILLS[unitId]?.count ?? 0} questions`;
  if (kind === 'game') return gameSpec(unitId)?.size ?? '';
  if (kind === 'case') return `${caseSummary.get(unitId)?.steps ?? 0} decisions`;
  return '';
}

/** The pass rule, for sheets and the bottom of each screen. */
export function passRule(unitId: string): string {
  const kind = practiceKind(unitId);
  if (kind === 'drill') {
    const spec = DRILLS[unitId];
    return spec ? `pass with ${spec.passRight} right in under ${clock(spec.targetSec * 1000)}` : '';
  }
  if (kind === 'game') return gameSpec(unitId)?.rule ?? '';
  if (kind === 'case') return `pass with ${casePassMark(unitId)} best calls`;
  return '';
}

/** What a phase 3 case's sheet says: its story is dealt only once the case is opened. */
export const CASE_UNSEEN = 'A short story of linked decisions on the desk. The story starts when you open the case.';

/** A short description for the unit sheet. */
export function practiceAbout(unitId: string): string {
  const kind = practiceKind(unitId);
  if (kind === 'drill') return DRILLS[unitId]?.about ?? '';
  if (kind === 'game') return gameSpec(unitId)?.about ?? '';
  if (kind === 'case') return caseSummary.get(unitId)?.setup ?? CASE_UNSEEN;
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
  if (kind === 'game') return gameSpec(unitId)?.record(rec) ?? '';
  if (kind === 'case') {
    const steps = caseSummary.get(unitId)?.steps ?? 0;
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

/**
 * Close a game round: record it, move the learner's pick on if it is done,
 * and count the day. XP is 5 for playing, plus the score, plus 5 for a pass.
 */
export function finishGame(progress: Progress, unitId: string, today: string, score: number, passed: boolean, best?: number): { progress: Progress; xp: number; firstPass: boolean } {
  const firstPass = passed && !progress.drills?.[unitId]?.passed;
  const xp = 5 + score + (passed ? 5 : 0);
  let p = recordRound(progress, unitId, score, passed, today, best);
  p = settleFocus(p);
  p = finishLesson(p, today, xp);
  return { progress: p, xp, firstPass };
}
