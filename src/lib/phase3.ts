/**
 * Phase 3: trading strategies. Its units sit at the end of the one track and
 * open only when the learner has entered the password and passed the readiness
 * test, a check on the options, futures, risk and backtesting terms the strategies build on.
 */
import { categories, isPhase3Area, mainTermIds, metInUnit, path, unitSize } from './content';
import type { Progress } from './types';

/** The key phase 3 uses in `progress.tests` and `progress.unlocked`. */
export const PHASE3 = 'phase3';
/** Questions in one readiness test. Passing takes 80% of them, as in the area tests. */
export const PHASE3_TEST_SIZE = 20;

/** What the test asks about, and the test itself, are in phase3prereqs.ts: the server builds it, so the app never lists them. */

/** Phase 3 is open once the password was entered and the readiness test passed. */
export function phase3Open(p: Progress): boolean {
  return !!p.phase3Key && !!p.unlocked?.includes(PHASE3);
}

/** The test can be taken while phase 3 is shut, with the password entered, once a day. */
export function canTakePhase3Test(p: Progress, today: string): boolean {
  return !phase3Open(p) && !!p.phase3Key && p.tests?.[PHASE3]?.date !== today;
}

export function withPhase3Key(p: Progress): Progress {
  return { ...p, phase3Key: true };
}

/** Phase 3 units in track order. */
export const phase3UnitIds: string[] = path.filter((r) => r.pass === 3).map((r) => r.unit.id);

export const phase3Names: string[] = categories.filter((c) => isPhase3Area(c.id)).map((c) => c.name);

/** How many terms a learner can reach, and how many of those they've met: phase 3's only once it's open. */
export function reachableCount(p: Progress): { total: number; met: number } {
  const rows = phase3Open(p) ? path : path.filter((r) => r.pass !== 3);
  return { total: rows.reduce((n, r) => n + unitSize(r.unit.id), 0), met: rows.reduce((n, r) => n + metInUnit(p, r.unit.id), 0) };
}

/** Terms a learner can reach: phase 3's only once it's open. Only the known ones: the Worker knows them all. */
export function reachableTermIds(p: Progress): string[] {
  return phase3Open(p) ? path.flatMap((r) => r.terms.map((t) => t.id)) : mainTermIds();
}
