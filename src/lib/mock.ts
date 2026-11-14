/**
 * Timed mock interview rounds: a fixed number of questions against one clock,
 * with no feedback until the end, like the real thing. Questions come from
 * the drills (typed answers) and worked sums on the cards. The sums are dealt by the server
 * without their answers (worker/session.ts) and marked when the round ends.
 */
import { checkAnswer, DRILLS, type DrillQuestion } from './drills';
import { shuffle, type Rng } from './questions';
import type { Progress } from './types';

export type MockSource = { drill: string } | { calcs: string[] };

export interface MockSpec {
  /** The interview round on the career map this mocks. */
  round: string;
  count: number;
  minutes: number;
  sources: MockSource[];
  about: string;
}

/** Score at or above this share and the round counts as interview-ready. */
export const MOCK_READY = 0.8;

export const MOCKS: MockSpec[] = [
  { round: 'Online test', count: 12, minutes: 12, sources: [{ drill: 'k1' }, { drill: 'k2' }, { drill: 'k3' }, { drill: 'k6' }], about: 'Arithmetic, percentages, probability and counting, mixed.' },
  { round: 'Mental maths', count: 15, minutes: 5, sources: [{ drill: 'k1' }, { drill: 'k2' }], about: 'Quick-fire sums and percentages, twenty seconds each.' },
  {
    round: 'Probability and puzzles',
    count: 10,
    minutes: 12,
    sources: [{ drill: 'k3' }, { drill: 'k4' }, { drill: 'k5' }, { drill: 'k6' }],
    about: 'Chances, expected value, Bayes and counting.',
  },
  { round: 'Markets and options', count: 10, minutes: 10, sources: [{ calcs: ['options', 'instruments', 'trading'] }], about: 'Worked sums on options, futures, carry and margins.' },
  { round: 'Statistics and research', count: 10, minutes: 10, sources: [{ calcs: ['quant'] }], about: 'Worked sums on returns, risk, Sharpe, drawdowns and backtests.' },
];
export const mockByRound = new Map(MOCKS.map((m) => [m.round, m]));

/** A worked sum as the server deals it: sealed until the round is marked. */
export interface Sum {
  termId: string;
  prompt: string;
  options: string[];
  token: string;
}

export type MockQuestion =
  | { kind: 'typed'; prompt: string; drill: DrillQuestion }
  /** `answer` and `why` are filled in once the round is marked. */
  | { kind: 'choice'; prompt: string; options: string[]; sum: Sum; answer?: number; why?: string };

/** Does this round ask worked sums (which come from the server)? */
export const hasSums = (spec: MockSpec) => spec.sources.some((s) => 'calcs' in s);

function pool(source: MockSource, rng: Rng, sums: Sum[]): MockQuestion[] {
  if ('drill' in source) return DRILLS[source.drill].make(rng).map((d) => ({ kind: 'typed', prompt: d.prompt, drill: d }));
  // Worked sums from the terms this learner has met, dealt by the server.
  return shuffle(sums, rng).map((sum) => ({ kind: 'choice', prompt: sum.prompt, options: sum.options, sum }));
}

/** Fewest questions a round runs with: a sums round is short until the learner has reached enough of its terms. */
export const MOCK_MIN = 5;

/** A round: questions taken in turn from each source, no prompt twice. */
export function newMock(spec: MockSpec, rng: Rng, sums: Sum[] = []): MockQuestion[] {
  const pools = spec.sources.map((s) => pool(s, rng, sums));
  const seen = new Set<string>();
  const out: MockQuestion[] = [];
  for (let guard = 0; out.length < spec.count && guard < 50; guard++) {
    for (let i = 0; i < pools.length && out.length < spec.count; i++) {
      if (!pools[i].length) pools[i] = pool(spec.sources[i], rng, sums);
      // A sums source with no terms reached yet has nothing to give.
      const q = pools[i].shift();
      if (!q) continue;
      const key = q.prompt;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(q);
    }
  }
  return shuffle(out, rng);
}

/** An answer: the typed text, or the option index, or null if skipped or out of time. */
export type MockAnswer = string | number | null;

export function isRight(q: MockQuestion, a: MockAnswer): boolean {
  if (a === null) return false;
  if (q.kind === 'typed') return typeof a === 'string' && checkAnswer(q.drill, a) === 'right';
  return q.answer !== undefined && a === q.answer;
}

export function recordMock(p: Progress, round: string, right: number, total: number, today: string): Progress {
  const prev = p.mocks?.[round];
  const best = prev && prev.best / prev.total >= right / total ? prev : { best: right, total, date: today };
  return { ...p, mocks: { ...p.mocks, [round]: { ...best, tries: (prev?.tries ?? 0) + 1 } } };
}

export const mockReady = (right: number, total: number) => right / total >= MOCK_READY;
