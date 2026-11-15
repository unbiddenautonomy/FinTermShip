// The phase 3 readiness test, built on the server (worker/session.ts). Kept apart from
// phase3.ts so the app's files never list the terms it asks about.
import { termById } from './content';
import type { LessonPlan } from './lesson';
import { PHASE3, PHASE3_TEST_SIZE } from './phase3';
import { calcQuestion, fillQuestion, shuffle, termQuestion, type Rng } from './questions';
import type { Term } from './types';

/** What the strategies build on: option pricing and Greeks, futures and carry, risk, margins, execution, speed and backtesting. */
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
  'market-impact',
  'hft',
  'latency',
  'z-score',
  'stationarity',
  'autocorrelation',
  'momentum-factor',
  'backtest',
  'overfitting',
  'out-of-sample',
];

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
