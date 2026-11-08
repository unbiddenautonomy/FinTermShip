/**
 * Guess the number: build a feel for correlation, volatility and fat tails.
 *
 * Ten items a round: four scatters (guess the correlation), four price charts
 * with their daily moves (guess the annualised vol), and two pairs of daily
 * return series with the same volatility (pick the one with fat tails). The
 * answer is always the statistic of the data drawn, not the setting used to
 * draw it, so what you see is exactly what is scored.
 */
import { shuffle, type Rng } from './questions';

export const GUESS = {
  items: 10,
  passHits: 7,
  /** A correlation guess counts within this much of the answer. */
  corrTol: 0.15,
  /** A vol guess counts within this share of the answer. */
  volTol: 0.25,
  points: 80,
  days: 60,
};

export type GuessItem =
  | { kind: 'corr'; xs: number[]; ys: number[]; answer: number }
  | { kind: 'vol'; closes: number[]; returns: number[]; answer: number }
  | { kind: 'tails'; series: [number[], number[]]; answer: 0 | 1 };

/** Standard normal draws (Box-Muller). */
export function normal(rng: Rng): number {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function stdev(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export function correlation(xs: number[], ys: number[]): number {
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

/** Excess kurtosis: about 0 for normal data, large when a few days are huge. */
export function excessKurtosis(xs: number[]): number {
  const m = mean(xs);
  const s2 = xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length;
  const m4 = xs.reduce((a, x) => a + (x - m) ** 4, 0) / xs.length;
  return m4 / (s2 * s2) - 3;
}

/** Annualised vol in percent from daily returns (√252 ≈ 16). */
export function annualVol(returns: number[]): number {
  return stdev(returns) * Math.sqrt(252) * 100;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

export function corrItem(rng: Rng): GuessItem {
  const rho = -0.95 + 1.9 * rng();
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < GUESS.points; i++) {
    const x = normal(rng);
    xs.push(x);
    ys.push(rho * x + Math.sqrt(1 - rho * rho) * normal(rng));
  }
  return { kind: 'corr', xs, ys, answer: round2(correlation(xs, ys)) };
}

export function volItem(rng: Rng): GuessItem {
  const sigma = [8, 10, 12, 15, 18, 20, 25, 30, 35, 40, 50, 60][Math.floor(rng() * 12)] / 100;
  const daily = sigma / Math.sqrt(252);
  const returns = Array.from({ length: GUESS.days }, () => daily * normal(rng));
  const closes = [100];
  for (const r of returns) closes.push(closes[closes.length - 1] * (1 + r));
  return { kind: 'vol', closes, returns, answer: Math.round(annualVol(returns)) };
}

/** Student-t with 3 degrees of freedom, scaled to unit variance. */
function fatDraw(rng: Rng): number {
  const z = normal(rng);
  const chi = normal(rng) ** 2 + normal(rng) ** 2 + normal(rng) ** 2;
  return z / Math.sqrt(chi / 3) / Math.sqrt(3);
}

const rescale = (xs: number[], sd: number) => {
  const s = stdev(xs);
  return xs.map((x) => (x / s) * sd);
};

export function tailsItem(rng: Rng): GuessItem {
  const sd = 0.01 + 0.01 * rng();
  // Redraw until the two really differ: a calm normal series and a fat-tailed one with a few big days.
  let thin: number[] = [];
  let fat: number[] = [];
  for (let tries = 0; tries < 50; tries++) {
    thin = Array.from({ length: GUESS.days }, () => normal(rng));
    if (excessKurtosis(thin) < 0.8) break;
  }
  for (let tries = 0; tries < 50; tries++) {
    fat = Array.from({ length: GUESS.days }, () => fatDraw(rng));
    if (excessKurtosis(fat) > 4) break;
  }
  const answer = rng() < 0.5 ? 0 : 1;
  const series: [number[], number[]] = answer === 0 ? [rescale(fat, sd), rescale(thin, sd)] : [rescale(thin, sd), rescale(fat, sd)];
  return { kind: 'tails', series, answer };
}

export function newGuessRound(rng: Rng): GuessItem[] {
  const kinds = shuffle(['corr', 'corr', 'corr', 'corr', 'vol', 'vol', 'vol', 'vol', 'tails', 'tails'] as const, rng);
  return kinds.map((k) => (k === 'corr' ? corrItem(rng) : k === 'vol' ? volItem(rng) : tailsItem(rng)));
}

/** A guess is a hit when it is close enough to the answer. */
export function isHit(item: GuessItem, guess: number): boolean {
  if (item.kind === 'corr') return Math.abs(guess - item.answer) <= GUESS.corrTol + 1e-9;
  if (item.kind === 'vol') return Math.abs(guess - item.answer) <= GUESS.volTol * item.answer + 1e-9;
  return guess === item.answer;
}

/** The accepted range, for the feedback. */
export function acceptRange(item: GuessItem): string {
  if (item.kind === 'corr') return `${fmtCorr(item.answer - GUESS.corrTol)} to ${fmtCorr(item.answer + GUESS.corrTol)}`;
  if (item.kind === 'vol') return `${Math.ceil(item.answer * (1 - GUESS.volTol))}% to ${Math.floor(item.answer * (1 + GUESS.volTol))}%`;
  return '';
}

export function fmtCorr(x: number): string {
  const r = Math.max(-1, Math.min(1, Math.round(x * 100) / 100));
  return (r < 0 ? '−' : '') + Math.abs(r).toFixed(2);
}

/** Daily moves bigger than three standard deviations: a normal series almost never has one in 60 days. */
export function bigDays(xs: number[]): number {
  const s = stdev(xs);
  return xs.filter((x) => Math.abs(x) > 3 * s).length;
}
