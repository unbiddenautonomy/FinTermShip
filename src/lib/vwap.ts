/**
 * Beat VWAP: work a big buy order through the day.
 *
 * A client wants 6 lakh shares bought by the close, against the day's VWAP.
 * The day is cut into ten slices, and before each one you pick how much of
 * the market's volume to take: 0% to 25%. Volume follows the usual U shape
 * (busy at the open and the close, quiet at lunch), but each day runs a bit
 * above or below the forecast, and one slice brings a surprise: a big seller
 * who doubles the volume, or a lull that halves it.
 *
 * Trading costs come in two kinds:
 * - temporary impact: the faster you trade, the more you pay above the
 *   market in that slice;
 * - permanent impact: every share you buy nudges the price up for the rest
 *   of the day.
 *
 * The last slice always finishes the order, so the learner makes nine calls
 * and the skill is arriving at the close with little enough left. Two
 * checks: never take more than 20% of any slice's volume (the client's cap),
 * the last slice included, and end within 8 bps of VWAP. The day's VWAP includes
 * your own prints, as it does in real life.
 */
import { normal } from './guess';
import type { Rng } from './questions';

export const VWAP = {
  order: 600_000,
  /** The forecast for the whole day's volume. */
  forecast: 5_000_000,
  /** Share of the day's volume in each slice, in %. */
  profile: [14, 11, 9, 7, 6, 6, 8, 9, 13, 17],
  times: ['9:15', '9:45', '10:30', '11:15', '12:00', '12:45', '13:30', '14:15', '14:45', '15:15', '15:30'],
  rates: [0, 5, 10, 15, 20, 25],
  maxRate: 20,
  /** Temporary impact, bps per 1% of the slice's volume. */
  impactBps: 0.4,
  /** Permanent impact, bps per 1% of the day's forecast volume bought. */
  permBps: 0.3,
  sliceVol: 0.0022,
  start: 1500,
  slipBps: 8,
};

export const SLICES = VWAP.profile.length;

export type EventKind = 'seller' | 'lull';
export interface VwapDay {
  /** The market's volume in each slice, not counting you. */
  volumes: number[];
  /** The market's average price in each slice, before your permanent impact. */
  prices: number[];
  factor: number;
  event: { slice: number; kind: EventKind };
}

export interface Slice {
  /** The share of the slice's volume you chose to take, in %; for the last slice, what finishing took. */
  rate: number;
  shares: number;
  /** Your average price in the slice. */
  price: number;
  volume: number;
  /** The market's average price in the slice, with your impact so far. */
  market: number;
}
export interface VwapState {
  slices: Slice[];
  filled: number;
  cost: number;
}

const round100 = (x: number) => Math.round(x / 100) * 100;

export const forecastIn = (i: number) => (VWAP.forecast * VWAP.profile[i]) / 100;
/** The forecast volume from slice i to the close. */
export const forecastFrom = (i: number) => VWAP.profile.slice(i).reduce((a, b) => a + b, 0) * (VWAP.forecast / 100);

export function newVwapDay(rng: Rng): VwapDay {
  const factor = 0.85 + 0.3 * rng();
  const slice = 2 + Math.floor(rng() * 6);
  const kind: EventKind = rng() < 0.5 ? 'seller' : 'lull';
  const volumes = VWAP.profile.map((_, i) => round100(forecastIn(i) * factor * Math.exp(0.15 * normal(rng)) * (i === slice ? (kind === 'seller' ? 1.9 : 0.45) : 1)));
  const prices: number[] = [];
  let px = VWAP.start;
  for (let i = 0; i < SLICES; i++) {
    const open = px;
    px *= Math.exp(VWAP.sliceVol * normal(rng) + (i === slice && kind === 'seller' ? -0.003 : 0));
    prices.push((open + px) / 2);
  }
  return { volumes, prices, factor, event: { slice, kind } };
}

export const startState = (): VwapState => ({ slices: [], filled: 0, cost: 0 });

/** How much your buying so far has lifted the price, as a multiplier. */
const lift = (filled: number) => 1 + (VWAP.permBps * ((100 * filled) / VWAP.forecast)) / 1e4;

export function playSlice(day: VwapDay, state: VwapState, rate: number): VwapState {
  const i = state.slices.length;
  if (i >= SLICES) return state;
  const volume = day.volumes[i];
  const market = day.prices[i] * lift(state.filled);
  const left = VWAP.order - state.filled;
  // The last slice finishes the order, whatever share of the volume that takes.
  const last = i === SLICES - 1;
  const shares = last ? left : Math.min(left, round100((rate / 100) * volume));
  const taken = (100 * shares) / volume;
  const price = market * (1 + (VWAP.impactBps * taken) / 1e4);
  return {
    slices: [...state.slices, { rate: last ? Math.round(taken * 10) / 10 : rate, shares, price, volume, market }],
    filled: state.filled + shares,
    cost: state.cost + shares * price,
  };
}

export const isDone = (state: VwapState) => state.filled >= VWAP.order || state.slices.length >= SLICES;

/** The pace rule: what's left over the forecast volume left, to the nearest rate, capped. The last slice needs no call. */
export function paceRate(state: VwapState): number {
  const i = state.slices.length;
  if (i >= SLICES - 1) return 0;
  const need = (100 * (VWAP.order - state.filled)) / forecastFrom(i);
  const allowed = VWAP.rates.filter((r) => r <= VWAP.maxRate);
  return allowed.reduce((best, r) => (Math.abs(r - need) < Math.abs(best - need) ? r : best), allowed[0]);
}

/** The market's price in a slice, played or not. */
function marketAt(day: VwapDay, state: VwapState, i: number): { price: number; volume: number; shares: number; fill: number } {
  const s = state.slices[i];
  if (s) return { price: s.market, volume: s.volume, shares: s.shares, fill: s.price };
  return { price: day.prices[i] * lift(state.filled), volume: day.volumes[i], shares: 0, fill: 0 };
}

/** VWAP over the slices so far (or the whole day), including your prints. */
export function vwapUpTo(day: VwapDay, state: VwapState, slices: number): number {
  let value = 0;
  let volume = 0;
  for (let i = 0; i < slices; i++) {
    const m = marketAt(day, state, i);
    value += m.price * m.volume + m.fill * m.shares;
    volume += m.volume + m.shares;
  }
  return volume ? value / volume : VWAP.start;
}

export const averagePrice = (state: VwapState) => (state.filled ? state.cost / state.filled : 0);

export interface VwapScore {
  done: number;
  avg: number;
  vwap: number;
  /** Bps paid over VWAP; positive is worse. */
  slipBps: number;
  /** Bps paid over the 9:15 price. */
  shortfallBps: number;
  maxRate: number;
  checks: { capped: boolean; vwap: boolean };
  met: number;
  passed: boolean;
}

export function scoreVwap(day: VwapDay, state: VwapState): VwapScore {
  const avg = averagePrice(state);
  const vwap = vwapUpTo(day, state, SLICES);
  const slipBps = avg ? ((avg - vwap) / vwap) * 1e4 : 0;
  const shortfallBps = avg ? ((avg - VWAP.start) / VWAP.start) * 1e4 : 0;
  const traded = state.slices.filter((s) => s.shares > 0);
  const maxRate = traded.reduce((m, s) => Math.max(m, s.rate), 0);
  const done = state.filled / VWAP.order;
  const checks = { capped: maxRate <= VWAP.maxRate, vwap: avg > 0 && slipBps <= VWAP.slipBps };
  const met = Object.values(checks).filter(Boolean).length;
  return { done, avg, vwap, slipBps, shortfallBps, maxRate, checks, met, passed: met === 2 };
}

export const shares = (n: number) => Math.round(n).toLocaleString('en-IN');
export const bps = (x: number) => {
  const r = Math.round(x * 10) / 10;
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(1)} bps`;
};
