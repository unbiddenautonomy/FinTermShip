/**
 * Phase 3: trading strategies. Its units sit at the end of the one track and
 * open only when the learner has entered the password and passed the readiness
 * test, a check on the options, futures and risk terms the strategies build on.
 */
import { categories, isPhase3Area, mainTermIds, path, termById } from './content';
import type { LessonPlan } from './lesson';
import { calcQuestion, fillQuestion, shuffle, termQuestion, type Rng } from './questions';
import type { Progress, Term } from './types';

/** The key phase 3 uses in `progress.tests` and `progress.unlocked`. */
export const PHASE3 = 'phase3';
/** Questions in one readiness test. Passing takes 80% of them, as in the area tests. */
export const PHASE3_TEST_SIZE = 20;

/** What the strategies build on: option pricing and Greeks, futures and carry, risk, margins and execution. */
export const PHASE3_PREREQS = [
  'call-option',
  'put-option',
  'intrinsic-value',
  'time-value',
  'delta',
  'gamma',
  'theta',
  'vega',
  'implied-volatility',
  'delta-hedging',
  'short-gamma',
  'realised-volatility',
  'volatility-skew',
  'iv-crush',
  'put-call-parity',
  'covered-call',
  'protective-put',
  'straddle',
  'strangle',
  'bull-call-spread',
  'iron-condor',
  'calendar-spread',
  'gamma-scalping',
  'pin-risk',
  'synthetic-long',
  'box-spread',
  'cost-of-carry',
  'futures-fair-value',
  'basis',
  'rollover',
  'rollover-cost',
  'cash-and-carry-arbitrage',
  'basis-risk',
  'sharpe-ratio',
  'max-drawdown',
  'var',
  'expected-shortfall',
  'beta',
  'correlation',
  'lot-size',
  'span-margin',
  'exposure-margin',
  'market-maker',
  'adverse-selection',
  'slippage',
  'implementation-shortfall',
];

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

/** Terms a learner can still reach: phase 3's count only once it's open. */
export function reachableTermIds(p: Progress): string[] {
  return phase3Open(p) ? path.flatMap((r) => r.terms.map((t) => t.id)) : mainTermIds;
}

/** 20 questions drawn from the prerequisites: pick the term, fill the gap, or a worked sum. */
export function buildPhase3Test(rng: Rng): LessonPlan {
  const picked = shuffle(
    PHASE3_PREREQS.map((id) => termById.get(id)).filter((t): t is Term => !!t),
    rng,
  ).slice(0, PHASE3_TEST_SIZE);
  const qs = picked.map((t, i) => (i % 3 === 2 && calcQuestion(t, rng)) || (i % 2 ? fillQuestion(t, rng) : termQuestion(t, rng)));
  return {
    kind: 'test',
    newIds: [],
    reviewIds: [],
    questions: qs,
    categoryId: PHASE3,
  };
}
