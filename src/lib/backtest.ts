/**
 * Backtest detective: each report looks too good, and each has exactly one
 * flaw. Tap the line that gives it away, then name the flaw.
 *
 * The reports are written in backtests.json: a strategy has six clean lines,
 * one per part of the write-up, and a list of cases that each swap one line
 * for a flawed one. A round deals six cases with six different flaws, from six
 * different strategies.
 */
import strategies from '../data/backtests.json';
import { shuffle, type Rng } from './questions';

export const BACKTEST = { cases: 6, passPoints: 9 };
/** A point for finding the flawed line and a point for naming it. */
export const BACKTEST_POINTS = BACKTEST.cases * 2;

export const SLOTS = {
  universe: 'Universe',
  data: 'Data',
  trading: 'Signal and fills',
  costs: 'Costs',
  testing: 'Testing',
  result: 'Result',
} as const;
export type Slot = keyof typeof SLOTS;
export const SLOT_ORDER = Object.keys(SLOTS) as Slot[];

export const FLAWS = {
  survivorship: { name: 'Survivorship bias', term: 'survivorship-bias', slots: ['universe'], say: 'The losers are missing from the test.' },
  lookahead: { name: 'Look-ahead bias', term: 'look-ahead-bias', slots: ['universe', 'data', 'trading'], say: "It trades on something it couldn't have known yet." },
  costs: { name: 'Missing costs', term: 'transaction-costs', slots: ['costs'], say: 'Show it to me net of costs. It may not survive them.' },
  overfit: { name: 'Overfitting', term: 'overfitting', slots: ['testing'], say: "Too many knobs, or a knife-edge: it's fitted to the noise." },
  snooping: { name: 'Data snooping', term: 'data-snooping', slots: ['universe', 'testing'], say: "It's the best of a lot of tries. Deflate that Sharpe." },
  small: { name: 'Small sample', term: 'small-sample', slots: ['result'], say: 'Small sample: that could easily be luck.' },
  beta: { name: "It's just beta", term: 'just-beta', slots: ['result'], say: "It's just beta. Compare it with the index, not with cash." },
  baddata: { name: 'Bad data', term: 'garbage-in-garbage-out', slots: ['data'], say: 'Garbage in, garbage out. Clean the data first.' },
} as const;
export type Flaw = keyof typeof FLAWS;
export const FLAW_IDS = Object.keys(FLAWS) as Flaw[];

/** Overfitting and data snooping overlap, so one is never offered as a wrong name for the other. */
const SIBLING: Partial<Record<Flaw, Flaw>> = { overfit: 'snooping', snooping: 'overfit' };

export interface Strategy {
  id: string;
  title: string;
  about: string;
  lines: Record<Slot, string>;
  cases: { flaw: Flaw; slot: Slot; line: string; why: string; stats: { sharpe: number; annual: number; drawdown: number } }[];
}

export const STRATEGIES = strategies as Strategy[];

export interface BacktestCase {
  strategy: Strategy;
  flaw: Flaw;
  /** The six lines in slot order, one of them flawed. */
  lines: { slot: Slot; text: string }[];
  /** Index of the flawed line. */
  answer: number;
  why: string;
  stats: { sharpe: number; annual: number; drawdown: number };
  /** Four flaw names to choose from, one of them right. */
  names: Flaw[];
}

export function makeCase(strategy: Strategy, index: number, rng: Rng): BacktestCase {
  const c = strategy.cases[index];
  const lines = SLOT_ORDER.map((slot) => ({ slot, text: slot === c.slot ? c.line : strategy.lines[slot] }));
  const others = shuffle(
    FLAW_IDS.filter((f) => f !== c.flaw && f !== SIBLING[c.flaw]),
    rng,
  ).slice(0, 3);
  return { strategy, flaw: c.flaw, lines, answer: SLOT_ORDER.indexOf(c.slot), why: c.why, stats: c.stats, names: shuffle([c.flaw, ...others], rng) };
}

/** Six cases, six different flaws, six different strategies. */
export function newBacktestRound(rng: Rng): BacktestCase[] {
  for (;;) {
    const flaws = shuffle(FLAW_IDS, rng).slice(0, BACKTEST.cases);
    const used = new Set<string>();
    const picked: [Strategy, number][] = [];
    for (const f of flaws) {
      const options = STRATEGIES.flatMap((s) => s.cases.map((c, i) => [s, i, c.flaw] as const)).filter(([s, , flaw]) => flaw === f && !used.has(s.id));
      if (!options.length) break;
      const [s, i] = options[Math.floor(rng() * options.length)];
      used.add(s.id);
      picked.push([s, i]);
    }
    if (picked.length === BACKTEST.cases) return picked.map(([s, i]) => makeCase(s, i, rng));
  }
}

export const backtestPassed = (points: number) => points >= BACKTEST.passPoints;
