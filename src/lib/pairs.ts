/**
 * Pairs trader: trade the z-score of a spread that mean-reverts, until one
 * pair stops reverting.
 *
 * Three pairs, ten weekly calls each. A pair's z-score is measured against the
 * average and spread of its first 40 days (the formation period); after that
 * you check it once a week and choose your position: long the spread, flat, or
 * short the spread. One of the three pairs breaks partway through: its spread
 * moves to a new level and never comes back.
 *
 * The rules are the ones in the pairs case: enter at ±2, exit near 0, stop at
 * ±4, and once a pair hits the stop, leave it alone. Each weekly call is judged
 * against the rules from the position you actually held, so the score is about
 * decisions, not about how the spread happened to move.
 */
import { normal } from './guess';
import { shuffle, type Rng } from './questions';

export const PAIRS = {
  pairs: 3,
  weeks: 10,
  daysPerWeek: 5,
  formation: 40,
  entry: 2,
  /** Back within this much of 0 counts as back to the average. */
  exit: 0.5,
  stop: 4,
  passRight: 25,
  /** Rupees made or lost per point of z-score: ₹10 lakh a leg, with the spread's standard deviation about 1.5%. */
  perZ: 15_000,
  /** Brokerage, taxes and slippage to open or close both legs. */
  cost: 2_000,
};
export const PAIR_CALLS = PAIRS.pairs * PAIRS.weeks;
export const PAIR_DAYS = PAIRS.formation + PAIRS.weeks * PAIRS.daysPerWeek;

/** -1 is short the spread (sell A, buy B), 1 is long the spread (buy A, sell B). */
export type Pos = -1 | 0 | 1;

export interface Pair {
  name: string;
  a: string;
  b: string;
  /** Daily z-scores from day 0 to the last day of week 10. */
  z: number[];
  /** First day of the break, or null for a pair that keeps reverting. */
  breakDay: number | null;
  halfLife: number;
}

const NAMES: [string, string, string][] = [
  ['Two private banks', 'Bank A', 'Bank B'],
  ['Two IT services firms', 'IT A', 'IT B'],
  ['Two cement makers', 'Cement A', 'Cement B'],
  ['Two oil marketing companies', 'Oil A', 'Oil B'],
  ['Two two-wheeler makers', 'Auto A', 'Auto B'],
  ['Two paint makers', 'Paints A', 'Paints B'],
  ['Two steel makers', 'Steel A', 'Steel B'],
];

/** The day of each weekly call: the end of the formation period, then every five days. */
export const callDay = (week: number) => PAIRS.formation + week * PAIRS.daysPerWeek;

/** The z-score as shown, to one decimal. The rules read the number on screen. */
export const shownZ = (z: number) => Math.round(z * 10) / 10;

/** The positions the rules allow, from the one held coming in. The first is the rule's own call. */
export function ruleCalls(prev: Pos, zRaw: number, broken: boolean): Pos[] {
  const z = shownZ(zRaw);
  if (broken || Math.abs(z) >= PAIRS.stop) return [0];
  if (prev === 0) {
    const into: Pos = z > 0 ? -1 : 1;
    if (Math.abs(z) >= PAIRS.entry) return [into];
    if (Math.abs(z) >= 1.5) return [0, into];
    return [0];
  }
  // How much of the stretch the trade is betting on is left: positive while it lasts.
  const left = -prev * z;
  if (left <= -PAIRS.entry) return [(-prev) as Pos];
  if (left <= PAIRS.exit) return [0];
  if (left < 1) return [prev, 0];
  return [prev];
}

/** Why the rules call it that way, in a line. */
export function ruleReason(prev: Pos, zRaw: number, broken: boolean, legs: { a: string; b: string }): string {
  const z = shownZ(zRaw);
  const zt = fmtZ(z);
  if (broken) return 'This pair has hit its stop, so the rules leave it alone now.';
  if (Math.abs(z) >= PAIRS.stop) return `At ${zt} the stop says get out and stay out: the pair may have broken.`;
  if (prev === 0) {
    const dear = z > 0 ? legs.a : legs.b;
    const cheap = z > 0 ? legs.b : legs.a;
    if (Math.abs(z) >= PAIRS.entry) return `At ${zt}, ${dear} is dear against ${cheap}: sell ${dear}, buy ${cheap}.`;
    if (Math.abs(z) >= 1.5) return `At ${zt} it's close to the entry line, so waiting or going in were both fine.`;
    return `At ${zt} there's no stretch to trade: stay flat.`;
  }
  const left = -prev * z;
  if (left <= -PAIRS.entry) return `It overshot to ${zt}: close the trade and take the other side.`;
  if (left <= PAIRS.exit) return `At ${zt} the gap is back near its average: take the profit and go flat.`;
  if (left < 1) return `At ${zt} it's nearly back, so holding or taking the profit were both fine.`;
  return `At ${zt} it's still stretched and inside the stop: hold.`;
}

/** Whether a pair has touched the stop at any weekly call up to this one. */
export const brokenAt = (pair: Pair, week: number) => {
  for (let w = 0; w <= week; w++) if (Math.abs(shownZ(pair.z[callDay(w)])) >= PAIRS.stop) return true;
  return false;
};

/** The rule's calls, but holding the losing trade to the end instead of taking the stop. */
export function heldPath(pair: Pair): Pos[] {
  const rules = rulePath(pair);
  const first = rules.findIndex((_, w) => brokenAt(pair, w));
  return first < 1 ? rules : rules.map((x, w) => (w >= first ? rules[first - 1] : x));
}

/** The rule's own calls, week by week. */
export function rulePath(pair: Pair): Pos[] {
  const out: Pos[] = [];
  let prev: Pos = 0;
  for (let w = 0; w < PAIRS.weeks; w++) {
    prev = ruleCalls(prev, pair.z[callDay(w)], brokenAt(pair, w - 1))[0];
    out.push(prev);
  }
  return out;
}

/** PnL of a pair's weekly positions, with costs, closing whatever is open at the end. */
export function pairPnl(pair: Pair, positions: Pos[]): number {
  let pnl = 0;
  let prev: Pos = 0;
  positions.forEach((p, w) => {
    pnl -= Math.abs(p - prev) * PAIRS.cost;
    pnl += p * (pair.z[callDay(w) + PAIRS.daysPerWeek] - pair.z[callDay(w)]) * PAIRS.perZ;
    prev = p;
  });
  return Math.round(pnl - Math.abs(prev) * PAIRS.cost);
}

/** One week's PnL from holding a position, before costs. */
export const weekPnl = (pair: Pair, week: number, p: Pos) => Math.round(p * (pair.z[callDay(week) + PAIRS.daysPerWeek] - pair.z[callDay(week)]) * PAIRS.perZ);

function spread(rng: Rng, halfLife: number): number[] {
  const phi = 0.5 ** (1 / halfLife);
  const sd = Math.sqrt(1 - phi * phi);
  const x = [normal(rng)];
  for (let t = 1; t <= PAIR_DAYS; t++) x.push(phi * x[t - 1] + sd * normal(rng));
  // Measure everything against the formation period, as a desk would.
  const f = x.slice(0, PAIRS.formation);
  const m = f.reduce((a, b) => a + b, 0) / f.length;
  const s = Math.sqrt(f.reduce((a, b) => a + (b - m) ** 2, 0) / (f.length - 1));
  return x.map((v) => (v - m) / s);
}

const maxAbs = (xs: number[]) => Math.max(...xs.map(Math.abs));

export function makePair(rng: Rng, names: [string, string, string], breaks: boolean): Pair {
  const [name, a, b] = names;
  for (;;) {
    const halfLife = 4 + Math.floor(rng() * 4);
    const z = spread(rng, halfLife);
    const pair: Pair = { name, a, b, z, breakDay: null, halfLife };
    const trading = z.slice(PAIRS.formation);
    if (!breaks) {
      // A pair that keeps reverting: no stops, and at least one full trade by the rules.
      if (maxAbs(trading) >= 3.6 || maxAbs(z) >= 3.6) continue;
      const path = rulePath(pair);
      const entries = path.filter((p, w) => p !== 0 && (w === 0 || path[w - 1] !== p)).length;
      const exits = path.filter((p, w) => w > 0 && p === 0 && path[w - 1] !== 0).length;
      if (entries < 1 || exits < 1) continue;
      return pair;
    }
    // A break: from a day in weeks 2 to 5, the spread starts to run one way and doesn't come back.
    const start = callDay(1) + Math.floor(rng() * 4 * PAIRS.daysPerWeek);
    const size = (0.2 + 0.1 * rng()) * (rng() < 0.5 ? 1 : -1);
    const broke = z.map((v, t) => v + (t < start ? 0 : size * (t - start + 1)));
    if (maxAbs(broke.slice(0, start)) >= 3.6) continue;
    const bp: Pair = { ...pair, z: broke, breakDay: start };
    // The trap must spring: the rules are in the losing trade when the stop is first hit, with weeks left after it.
    const path = rulePath(bp);
    const firstStop = Array.from({ length: PAIRS.weeks }, (_, w) => w).find((w) => brokenAt(bp, w));
    if (firstStop === undefined || firstStop < 2 || firstStop > PAIRS.weeks - 3) continue;
    if (path[firstStop - 1] !== -Math.sign(size)) continue;
    return bp;
  }
}

/** Three pairs, one of which breaks. */
export function newPairsGame(rng: Rng): Pair[] {
  const names = shuffle(NAMES, rng);
  const broken = Math.floor(rng() * PAIRS.pairs);
  return Array.from({ length: PAIRS.pairs }, (_, i) => makePair(rng, names[i], i === broken));
}

export interface PairsScore {
  right: number;
  /** Weekly calls that held a trade at or past the stop. */
  missedStops: number;
  /** Entries the wrong way round: buying the dear leg. */
  wrongWay: number;
  pnl: number;
  rulePnl: number;
  passed: boolean;
}

/** Score a full game: calls[i][w] is the position chosen at week w on pair i. */
export function scorePairs(pairs: Pair[], calls: Pos[][]): PairsScore {
  let right = 0;
  let missedStops = 0;
  let wrongWay = 0;
  let pnl = 0;
  let rulePnl = 0;
  pairs.forEach((pair, i) => {
    let prev: Pos = 0;
    (calls[i] ?? []).forEach((c, w) => {
      const z = pair.z[callDay(w)];
      if (ruleCalls(prev, z, brokenAt(pair, w - 1)).includes(c)) right++;
      if (prev !== 0 && c !== 0 && Math.abs(shownZ(z)) >= PAIRS.stop) missedStops++;
      if (c !== 0 && c !== prev && Math.sign(c) === Math.sign(z) && Math.abs(shownZ(z)) >= 1) wrongWay++;
      prev = c;
    });
    pnl += pairPnl(pair, calls[i] ?? []);
    rulePnl += pairPnl(pair, rulePath(pair));
  });
  const complete = pairs.every((_, i) => calls[i]?.length === PAIRS.weeks);
  return { right, missedStops, wrongWay, pnl, rulePnl, passed: complete && right >= PAIRS.passRight && missedStops === 0 };
}

export const fmtZ = (z: number) => {
  const r = shownZ(z);
  return `${r >= 0 ? '+' : '−'}${Math.abs(r).toFixed(1)}`;
};
