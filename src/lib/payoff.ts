/**
 * Payoff builder: combine calls, puts and futures to match a target payoff at expiry.
 *
 * A round has six targets, two at each level: one leg, two legs, then three or
 * four legs or a ban on some instruments. Premiums come from Black-76 with no
 * interest, and puts are priced from calls by put-call parity, so equivalent
 * structures (a synthetic long and a long future, say) have exactly the same
 * payoff and both count as solving the target.
 */
import { shuffle, type Rng } from './questions';

export const PAYOFF = {
  targets: 6,
  /** Targets to solve without asking for the answer. */
  passSolved: 5,
  strikeStep: 100,
  /** Lots either way for each instrument. */
  maxQty: 2,
  /** Days to expiry and implied vol used to price the chain. */
  days: 7,
  vol: 0.13,
  /** The chart and the check run this far either side of the outer strikes. */
  margin: 300,
  gridStep: 50,
};

export type Instrument = 'call' | 'put' | 'fut';

export interface Leg {
  kind: Instrument;
  /** Strike for an option; unused for the future. */
  strike: number;
  /** Lots: positive is long (bought), negative is short (sold). */
  qty: number;
}

export interface Chain {
  /** Futures price, also the at-the-money strike. */
  fut: number;
  strikes: number[];
  /** Premiums in index points, by strike. */
  call: number[];
  put: number[];
}

export interface Target {
  id: string;
  level: 1 | 2 | 3;
  /** The name shown once solved. */
  name: string;
  /** Term the target practises, if the app has a card for it. */
  termId?: string;
  /** What the desk wants, in plain words. */
  brief: string;
  legs: Leg[];
  /** Instruments that may not be used for this target. */
  banned?: Instrument[];
  /** A position the learner already holds: it starts in the builder and can't be changed. */
  holds?: Leg[];
  /** One line shown after solving. */
  why: string;
}

export interface PayoffRound {
  chain: Chain;
  targets: Target[];
}

// ---------- pricing ----------

export function normCdf(x: number): number {
  // Abramowitz and Stegun 7.1.26, accurate to about 1e-7.
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp((-x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Black-76 call price with no discounting. */
export function callPrice(fut: number, strike: number, vol: number, years: number): number {
  const s = vol * Math.sqrt(years);
  const d1 = (Math.log(fut / strike) + (s * s) / 2) / s;
  return fut * normCdf(d1) - strike * normCdf(d1 - s);
}

/** Five strikes around the futures price; calls rounded to whole points and puts set by parity (P = C − (F − K)). */
export function makeChain(fut: number): Chain {
  const strikes = [-2, -1, 0, 1, 2].map((i) => fut + i * PAYOFF.strikeStep);
  const call = strikes.map((k) => Math.max(1, Math.round(callPrice(fut, k, PAYOFF.vol, PAYOFF.days / 365))));
  const put = strikes.map((k, i) => call[i] - (fut - k));
  return { fut, strikes, call, put };
}

export function premium(chain: Chain, leg: Leg): number {
  if (leg.kind === 'fut') return chain.fut;
  const i = chain.strikes.indexOf(leg.strike);
  return leg.kind === 'call' ? chain.call[i] : chain.put[i];
}

// ---------- payoff ----------

/** Profit or loss in index points at expiry, premiums included, for one unit per lot. */
export function payoffAt(chain: Chain, legs: Leg[], spot: number): number {
  let total = 0;
  for (const leg of legs) {
    if (!leg.qty) continue;
    const value = leg.kind === 'fut' ? spot : leg.kind === 'call' ? Math.max(spot - leg.strike, 0) : Math.max(leg.strike - spot, 0);
    const cost = leg.kind === 'fut' ? chain.fut : premium(chain, leg);
    total += leg.qty * (value - cost);
  }
  return total;
}

/** Spots the chart and the check use: every strike, and a few steps beyond the outer ones. */
export function grid(chain: Chain): number[] {
  const lo = chain.strikes[0] - PAYOFF.margin;
  const hi = chain.strikes[chain.strikes.length - 1] + PAYOFF.margin;
  const out: number[] = [];
  for (let s = lo; s <= hi; s += PAYOFF.gridStep) out.push(s);
  return out;
}

/**
 * Two payoffs are the same if they agree at every grid point. Both are straight
 * lines between strikes and beyond the outer strikes, so agreeing on the grid
 * (which holds every strike and points past the outer ones) means agreeing everywhere.
 */
export function samePayoff(chain: Chain, a: Leg[], b: Leg[]): boolean {
  return grid(chain).every((s) => Math.abs(payoffAt(chain, a, s) - payoffAt(chain, b, s)) < 1e-6);
}

/** True if the legs only use instruments the target allows and stay inside the lot limits. */
export function allowed(target: Target, legs: Leg[]): boolean {
  return legs.every((l) => !l.qty || (!target.banned?.includes(l.kind) && Math.abs(l.qty) <= PAYOFF.maxQty));
}

/** The held legs are still there, unchanged. */
export function keepsHolds(target: Target, legs: Leg[]): boolean {
  return (target.holds ?? []).every((h) => legs.find((l) => l.kind === h.kind && (h.kind === 'fut' || l.strike === h.strike))?.qty === h.qty);
}

export function solves(chain: Chain, target: Target, legs: Leg[]): boolean {
  return allowed(target, legs) && keepsHolds(target, legs) && samePayoff(chain, target.legs, legs);
}

export interface PayoffStats {
  /** Spots where the payoff crosses zero. */
  breakevens: number[];
  /** Best and worst outcome in points; null when unlimited. */
  maxProfit: number | null;
  maxLoss: number | null;
  /** The worst case only happens if the index goes to zero. */
  lossAtZero: boolean;
  profitAtZero: boolean;
  /** Payoff is the same wherever the index ends. */
  flat: boolean;
}

/** Breakevens and the best and worst case, from the value at zero, at each strike, and the slope above the top strike. */
export function payoffStats(chain: Chain, legs: Leg[]): PayoffStats {
  const pts = [0, ...chain.strikes];
  const vals = pts.map((s) => payoffAt(chain, legs, s));
  const top = pts[pts.length - 1];
  const last = vals[vals.length - 1];
  const slope = payoffAt(chain, legs, top + 1) - last;
  const bes = new Set<number>();
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = [vals[i], vals[i + 1]];
    if (i > 0 && a === 0 && b !== 0) bes.add(pts[i]);
    else if (a * b < 0) bes.add(Math.round(pts[i] + ((pts[i + 1] - pts[i]) * -a) / (b - a)));
  }
  if (slope !== 0 && last === 0) bes.add(top);
  else if (last * slope < 0) bes.add(Math.round(top - last / slope));
  const flat = slope === 0 && vals.every((v) => v === vals[0]);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  return {
    breakevens: flat ? [] : [...bes].sort((x, y) => x - y),
    maxProfit: slope > 0 ? null : max,
    maxLoss: slope < 0 ? null : min,
    lossAtZero: slope >= 0 && vals[0] === min && vals[0] < vals[1],
    profitAtZero: slope <= 0 && vals[0] === max && vals[0] > vals[1],
    flat,
  };
}

// ---------- targets ----------

type Make = (k: number[], rng: Rng) => Omit<Target, 'id' | 'level'>;

const call = (strike: number, qty: number): Leg => ({ kind: 'call', strike, qty });
const put = (strike: number, qty: number): Leg => ({ kind: 'put', strike, qty });
const fut = (qty: number): Leg => ({ kind: 'fut', strike: 0, qty });
const either = <T,>(rng: Rng, a: T, b: T) => (rng() < 0.5 ? a : b);
const n = (x: number) => x.toLocaleString('en-IN');

/** Strikes come in as k[0..4], low to high, with k[2] at the money. */
const LIBRARY: Record<1 | 2 | 3, Record<string, Make>> = {
  1: {
    'long-call': (k, rng) => {
      const s = either(rng, k[2], k[3]);
      return { name: 'Long call', termId: 'call-option', brief: `Make money if Nifty rallies past ${n(s)}, and never lose more than you paid.`, legs: [call(s, 1)], why: 'Buying a call caps the loss at the premium and leaves the upside open.' };
    },
    'long-put': (k, rng) => {
      const s = either(rng, k[1], k[2]);
      return { name: 'Long put', termId: 'put-option', brief: `Make money if Nifty falls below ${n(s)}, and never lose more than you paid.`, legs: [put(s, 1)], why: 'Buying a put is the simplest way to pay a fixed amount for downside protection.' };
    },
    'short-call': (k, rng) => {
      const s = either(rng, k[3], k[4]);
      return { name: 'Short call', termId: 'option-writer', brief: `Collect premium now. Keep all of it if Nifty stays below ${n(s)}, and lose if it rallies hard.`, legs: [call(s, -1)], why: 'Selling a call earns the premium, but the loss has no ceiling if the index keeps rising.' };
    },
    'short-put': (k, rng) => {
      const s = either(rng, k[1], k[2]);
      return { name: 'Short put', termId: 'option-writer', brief: `Collect premium now. Keep all of it if Nifty stays above ${n(s)}, and lose if it falls hard.`, legs: [put(s, -1)], why: 'Selling a put earns the premium and loses like a long position below the strike.' };
    },
    'long-future': () => ({ name: 'Long future', termId: 'futures-contract', brief: 'Gain or lose point for point with Nifty, with nothing paid up front.', legs: [fut(1)], why: 'A future is a straight line: one point of profit for every point Nifty rises.' }),
    'short-future': () => ({ name: 'Short future', termId: 'futures-contract', brief: 'Gain point for point as Nifty falls.', legs: [fut(-1)], why: 'A short future is the mirror image: one point of profit for every point Nifty falls.' }),
  },
  2: {
    straddle: (k) => ({ name: 'Long straddle', termId: 'straddle', brief: `Make money if Nifty moves a long way from ${n(k[2])} in either direction.`, legs: [call(k[2], 1), put(k[2], 1)], why: 'A call and a put at the same strike: you pay two premiums and need a big move to get them back.' }),
    'short-straddle': (k) => ({ name: 'Short straddle', termId: 'straddle', brief: `Collect the most premium you can, betting Nifty ends right at ${n(k[2])}.`, legs: [call(k[2], -1), put(k[2], -1)], why: 'Selling both options at the money earns the most premium and loses on a big move either way.' }),
    strangle: (k) => ({ name: 'Long strangle', termId: 'strangle', brief: `A cheaper bet on a big move: pay less, but Nifty must get past ${n(k[1])} or ${n(k[3])} before it pays.`, legs: [put(k[1], 1), call(k[3], 1)], why: 'Out-of-the-money options cost less than a straddle, so the move needed to profit is bigger.' }),
    'short-strangle': (k) => ({ name: 'Short strangle', termId: 'strangle', brief: `Collect premium as long as Nifty ends between ${n(k[1])} and ${n(k[3])}.`, legs: [put(k[1], -1), call(k[3], -1)], why: 'Selling out-of-the-money options gives a wide band to be right in, with open losses outside it.' }),
    'bull-call-spread': (k) => ({ name: 'Bull call spread', termId: 'bull-call-spread', brief: `A cheap bullish bet: profit if Nifty rises from ${n(k[2])}, but give up anything above ${n(k[3])}.`, legs: [call(k[2], 1), call(k[3], -1)], why: 'Selling the higher call pays for part of the lower one, and caps both the cost and the gain.' }),
    'covered-call': (k) => ({ name: 'Covered call', termId: 'covered-call', brief: `You hold a long future. Earn extra income by agreeing to give up gains above ${n(k[3])}.`, legs: [fut(1), call(k[3], -1)], holds: [fut(1)], why: 'The premium from the sold call cushions a small fall, but the upside stops at the strike.' }),
    'protective-put': (k) => ({ name: 'Protective put', termId: 'protective-put', brief: `You hold a long future. Pay for a floor so the loss stops below ${n(k[1])}.`, legs: [fut(1), put(k[1], 1)], holds: [fut(1)], why: 'The put works like insurance: a premium paid up front for a known worst case.' }),
    'synthetic-long': (k) => ({ name: 'Synthetic long future', termId: 'synthetic-long', brief: 'Build the payoff of a long future, but using only options.', legs: [call(k[2], 1), put(k[2], -1)], banned: ['fut'], why: 'Long a call and short a put at the same strike moves point for point with the index: put-call parity.' }),
  },
  3: {
    'iron-condor': (k) => ({ name: 'Iron condor', termId: 'iron-condor', brief: `Earn premium if Nifty stays between ${n(k[1])} and ${n(k[3])}, with the loss capped on both sides.`, legs: [put(k[0], 1), put(k[1], -1), call(k[3], -1), call(k[4], 1)], why: 'A short strangle with bought wings: the wings cap the loss, and cost part of the premium.' }),
    conversion: (k) => ({ name: 'Conversion', termId: 'conversion', brief: `You hold a long future. Add options so the result is the same wherever Nifty ends.`, legs: [fut(1), put(k[2], 1), call(k[2], -1)], holds: [fut(1)], why: 'Long future, long put and short call at one strike cancel out to a flat line: parity, used for arbitrage.' }),
    'synthetic-short': (k) => ({ name: 'Synthetic short future', termId: 'synthetic-short', brief: 'Build the payoff of a short future, using only options.', legs: [call(k[2], -1), put(k[2], 1)], banned: ['fut'], why: 'Short a call and long a put at one strike falls point for point with the index.' }),
    'bull-spread-puts': (k) => ({ name: 'Bull spread made from puts', termId: 'bull-call-spread', brief: `Copy a bull call spread from ${n(k[2])} to ${n(k[3])}, using only puts.`, legs: [put(k[2], 1), put(k[3], -1)], banned: ['call', 'fut'], why: 'By parity, the same two strikes give the same shape with puts, taking in premium instead of paying it.' }),
    'covered-strangle': (k) => ({ name: 'Covered call with a floor', brief: `You hold a long future. Sell the ${n(k[3])} call to pay for the ${n(k[1])} put, so the loss and the gain are both capped.`, legs: [fut(1), put(k[1], 1), call(k[3], -1)], holds: [fut(1)], why: 'Hedgers use this shape to protect a holding cheaply: the sold call funds the floor.' }),
  },
};

export const TARGET_IDS = Object.values(LIBRARY).flatMap((l) => Object.keys(l));

export function makeTarget(chain: Chain, level: 1 | 2 | 3, id: string, rng: Rng): Target {
  return { id, level, ...LIBRARY[level][id](chain.strikes, rng) };
}

/** A round: a fresh futures price and two targets from each level. */
export function newPayoffRound(rng: Rng): PayoffRound {
  const fut = 24_000 + 100 * Math.floor(rng() * 21);
  const chain = makeChain(fut);
  const targets: Target[] = [];
  for (const level of [1, 2, 3] as const) {
    for (const id of shuffle(Object.keys(LIBRARY[level]), rng).slice(0, 2)) targets.push(makeTarget(chain, level, id, rng));
  }
  return { chain, targets };
}

/** Every leg the builder offers, all at zero except what the target says you already hold. */
export function emptyLegs(chain: Chain, target?: Target): Leg[] {
  const held = (kind: Instrument, strike: number) => target?.holds?.find((h) => h.kind === kind && (kind === 'fut' || h.strike === strike))?.qty ?? 0;
  return [...chain.strikes.flatMap((k) => [call(k, held('call', k)), put(k, held('put', k))]), fut(held('fut', 0))];
}

/** True if this leg is part of what the target says you hold. */
export function isHeld(target: Target, leg: Leg): boolean {
  return !!target.holds?.some((h) => h.kind === leg.kind && (leg.kind === 'fut' || h.strike === leg.strike));
}

/** Score: targets solved without revealing the answer. */
export function payoffPassed(solved: number): boolean {
  return solved >= PAYOFF.passSolved;
}
