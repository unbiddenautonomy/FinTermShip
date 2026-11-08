/**
 * Kelly betting: size bets on biased coins over many flips.
 *
 * Three coins, ten flips each, in a random order: an even-money coin with an
 * edge, a coin that pays better odds but wins less often, and a coin with no
 * edge at all. Before each flip the player picks a fraction of the bankroll.
 * The Kelly fraction for a coin that wins with chance p and pays b to 1 is
 * (b·p − (1 − p)) / b, and zero when that is negative.
 *
 * The checks are about decisions, not luck: bets near Kelly on the coins with an
 * edge, nothing on the coin without one, and never more than twice Kelly.
 */
import { shuffle, type Rng } from './questions';

export const KELLY = {
  start: 1_00_000,
  flipsPerCoin: 10,
  /** Fractions offered, in percent. */
  chips: [0, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100],
  /** A bet counts as well sized between these multiples of Kelly. */
  band: [0.5, 1.5] as const,
  /** More than this multiple of Kelly is overbetting. */
  overbet: 2,
  /** Pass marks. */
  sizedNeeded: 14,
  outNeeded: 8,
};

export interface Coin {
  /** Chance of winning a flip. */
  p: number;
  /** Pays b to 1: a win returns b times the stake as profit. */
  b: number;
}

export interface KellyGame {
  coins: Coin[];
  /** Pre-drawn results, true for a win, per coin. */
  flips: boolean[][];
}

export function kellyFraction(c: Coin): number {
  return Math.max(0, (c.b * c.p - (1 - c.p)) / c.b);
}

/** Expected profit per rupee staked. */
export function edge(c: Coin): number {
  return c.b * c.p - (1 - c.p);
}

/** Expected log growth per flip when betting fraction f. */
export function growth(c: Coin, f: number): number {
  if (f >= 1) return c.p === 1 ? Math.log(1 + c.b) : -Infinity;
  return c.p * Math.log(1 + c.b * f) + (1 - c.p) * Math.log(1 - f);
}

/** Coins whose Kelly fraction is one of the chips. */
const EVEN: Coin[] = [
  { p: 0.6, b: 1 },
  { p: 0.55, b: 1 },
  { p: 0.65, b: 1 },
  { p: 0.7, b: 1 },
];
const ODDS: Coin[] = [
  { p: 0.4, b: 2 },
  { p: 0.5, b: 2 },
  { p: 0.25, b: 5 },
  { p: 0.75, b: 0.5 },
];
const NO_EDGE: Coin[] = [
  { p: 0.5, b: 1 },
  { p: 0.45, b: 1 },
  { p: 0.3, b: 2 },
  { p: 0.55, b: 0.8 },
];

const pick = <T,>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];

export function newKellyGame(rng: Rng): KellyGame {
  const coins = shuffle([pick(rng, EVEN), pick(rng, ODDS), pick(rng, NO_EDGE)], rng);
  const flips = coins.map((c) => Array.from({ length: KELLY.flipsPerCoin }, () => rng() < c.p));
  return { coins, flips };
}

/** Bankroll after one flip, to the nearest rupee. */
export function settle(bankroll: number, fraction: number, coin: Coin, win: boolean): number {
  const stake = Math.round(bankroll * fraction);
  return Math.max(0, bankroll + (win ? Math.round(stake * coin.b) : -stake));
}

/** Bankroll path betting a fixed multiple of Kelly on every flip. */
export function pathAt(game: KellyGame, multiple: number): number {
  let bank = KELLY.start;
  game.coins.forEach((c, i) => {
    const f = Math.min(1, kellyFraction(c) * multiple);
    for (const win of game.flips[i]) bank = settle(bank, f, c, win);
  });
  return bank;
}

export type BetVerdict = 'sized' | 'small' | 'big' | 'over' | 'out' | 'in';

/** How one bet compares with Kelly. */
export function judge(coin: Coin, f: number): BetVerdict {
  const k = kellyFraction(coin);
  if (k === 0) return f === 0 ? 'out' : 'in';
  if (f > KELLY.overbet * k + 1e-9) return 'over';
  if (f < KELLY.band[0] * k - 1e-9) return 'small';
  if (f > KELLY.band[1] * k + 1e-9) return 'big';
  return 'sized';
}

export interface KellyScore {
  bankroll: number;
  /** Well-sized bets on the two coins with an edge (out of 20). */
  sized: number;
  /** Flips sat out on the coin without an edge (out of 10). */
  out: number;
  /** Bets above twice Kelly on a coin with an edge. */
  over: number;
  checks: { sized: boolean; out: boolean; over: boolean };
  passed: boolean;
}

/** Score a full game: bets[i][j] is the fraction bet on flip j of coin i. */
export function scoreKelly(game: KellyGame, bets: number[][]): KellyScore {
  let bank = KELLY.start;
  let sized = 0;
  let out = 0;
  let over = 0;
  game.coins.forEach((c, i) => {
    bets[i]?.forEach((f, j) => {
      const v = judge(c, f);
      if (v === 'sized') sized++;
      if (v === 'out') out++;
      if (v === 'over') over++;
      bank = settle(bank, f, c, game.flips[i][j]);
    });
  });
  const complete = game.coins.every((_, i) => bets[i]?.length === KELLY.flipsPerCoin);
  const checks = { sized: sized >= KELLY.sizedNeeded, out: out >= KELLY.outNeeded, over: over === 0 };
  return { bankroll: bank, sized, out, over, checks, passed: complete && checks.sized && checks.out && checks.over };
}

export const pct = (f: number) => `${Math.round(f * 1000) / 10}%`;

/** "Wins 60% of flips, pays 1 to 1." */
export function coinText(c: Coin): string {
  return `Wins ${Math.round(c.p * 100)}% of flips, pays ${odds(c.b)}`;
}

/** Odds as whole numbers: 2 → "2 to 1", 0.5 → "1 to 2", 0.8 → "4 to 5". */
export function odds(b: number): string {
  for (let d = 1; d <= 10; d++) {
    const n = b * d;
    if (Math.abs(n - Math.round(n)) < 1e-9) return `${Math.round(n)} to ${d}`;
  }
  return `${b} to 1`;
}
