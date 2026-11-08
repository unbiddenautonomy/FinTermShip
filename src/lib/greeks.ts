/**
 * Greeks PnL: given a book's Greeks in rupees and a market move, call the PnL.
 *
 * PnL ≈ delta × move + ½ × gamma × move² + vega × vol change + theta × days.
 * Delta is in rupees per index point, gamma in rupees per point per point,
 * vega in rupees per vol point and theta in rupees per day.
 *
 * Eight books a round, two at each level: delta and gamma on an instant move;
 * then overnight with theta; then a vol change too; then over a weekend.
 * The wrong options are the usual slips: dropping gamma or its half, flipping
 * a sign, or counting one day of theta over a weekend.
 */
import { shuffle, type Rng } from './questions';

export const GREEKS = { items: 8, passRight: 6 };

export interface Book {
  /** What the book holds, e.g. "Short Nifty straddles". */
  label: string;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
}

export interface Move {
  /** Index points. */
  spot: number;
  /** Vol points. */
  vol: number;
  days: number;
}

export interface Parts {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
}

export interface GreeksItem {
  level: 1 | 2 | 3 | 4;
  book: Book;
  move: Move;
  parts: Parts;
  total: number;
  /** Rupee amounts, one of them right. */
  options: number[];
  answer: number;
}

/** Turns −0 into 0, so a part that didn't move reads as nothing. */
const clean = (x: number) => (x === 0 ? 0 : x);

export function pnlParts(book: Book, move: Move): Parts {
  return {
    delta: clean(book.delta * move.spot),
    gamma: clean(0.5 * book.gamma * move.spot * move.spot),
    vega: clean(book.vega * move.vol),
    theta: clean(book.theta * move.days),
  };
}

export const sumParts = (p: Parts) => p.delta + p.gamma + p.vega + p.theta;

/** Signs of delta, gamma, vega and theta for each kind of book. Straddles carry a small delta either way. */
const BOOKS: { label: string; signs: [number, number, number, number] }[] = [
  { label: 'Long Nifty calls', signs: [1, 1, 1, -1] },
  { label: 'Long Nifty puts', signs: [-1, 1, 1, -1] },
  { label: 'Short Nifty puts', signs: [1, -1, -1, 1] },
  { label: 'Short Nifty calls', signs: [-1, -1, -1, 1] },
  { label: 'Short Nifty straddles', signs: [0, -1, -1, 1] },
  { label: 'Long Nifty straddles', signs: [0, 1, 1, -1] },
];

const pick = <T,>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];

/** Rupees in the Indian style: ₹1.25 lakh, ₹60,000. */
export function rupees(x: number, signed = true): string {
  const sign = x > 0 ? (signed ? '+' : '') : x < 0 ? '−' : '';
  const a = Math.abs(Math.round(x));
  if (a >= 1_00_00_000) return `${sign}₹${trim(a / 1_00_00_000)} crore`;
  if (a >= 1_00_000) return `${sign}₹${trim(a / 1_00_000)} lakh`;
  return `${sign}₹${a.toLocaleString('en-IN')}`;
}

const trim = (x: number) => String(Math.round(x * 100) / 100);

/** The usual mistakes, as alternative totals. */
function slips(parts: Parts, move: Move): number[] {
  const t = sumParts(parts);
  const out = [t - parts.gamma, t + parts.gamma, t - 2 * parts.gamma, t - 2 * parts.delta];
  if (parts.theta) out.push(t - parts.theta, t - 2 * parts.theta);
  if (parts.vega) out.push(t - 2 * parts.vega, t - parts.vega);
  if (move.days > 1) out.push(t - (parts.theta * (move.days - 1)) / move.days);
  return out;
}

/** Three wrong options from the slips, far enough from the answer and from each other to tell apart. */
export function greeksOptions(parts: Parts, move: Move, rng: Rng): number[] {
  const total = sumParts(parts);
  const gap = Math.max(10_000, Math.abs(total) * 0.15);
  const chosen: number[] = [];
  const far = (x: number) => [total, ...chosen].every((y) => Math.abs(x - y) >= gap);
  for (const x of shuffle(slips(parts, move), rng)) if (chosen.length < 3 && far(x)) chosen.push(x);
  for (let k = 1; chosen.length < 3; k++) {
    for (const x of [total + k * gap * 2, total - k * gap * 2]) if (chosen.length < 3 && far(x)) chosen.push(x);
  }
  return chosen.map((x) => Math.round(x / 500) * 500);
}

export function newGreeksItem(level: 1 | 2 | 3 | 4, rng: Rng): GreeksItem {
  const kind = pick(rng, BOOKS);
  const [sd, sg, sv, st] = kind.signs;
  const delta = sd ? sd * pick(rng, [500, 1000, 1500, 2000, 3000]) : pick(rng, [-500, 0, 500]);
  const book: Book = {
    label: kind.label,
    delta,
    gamma: sg * pick(rng, [10, 20, 30, 40]),
    vega: sv * pick(rng, [25_000, 50_000, 1_00_000, 1_50_000]),
    theta: st * pick(rng, [25_000, 50_000, 1_00_000, 1_50_000]),
  };
  const move: Move = {
    spot: pick(rng, [-1, 1]) * pick(rng, level === 1 ? [50, 100, 150, 200] : [100, 150, 200, 250, 300]),
    vol: level >= 3 ? pick(rng, [-2, -1, -0.5, 0.5, 1, 2]) : 0,
    days: level === 1 ? 0 : level === 4 ? 3 : 1,
  };
  const parts = pnlParts(book, move);
  const total = sumParts(parts);
  const wrong = greeksOptions(parts, move, rng);
  const options = shuffle([total, ...wrong], rng);
  return { level, book, move, parts, total, options, answer: options.indexOf(total) };
}

export function newGreeksRound(rng: Rng): GreeksItem[] {
  return ([1, 1, 2, 2, 3, 3, 4, 4] as const).map((level) => newGreeksItem(level, rng));
}

/** The move in words: "Nifty +150, IV −1 point, overnight". */
export function moveText(m: Move): string {
  const parts = [`Nifty ${m.spot > 0 ? '+' : '−'}${Math.abs(m.spot)} points`];
  if (m.vol) parts.push(`IV ${m.vol > 0 ? 'up' : 'down'} ${Math.abs(m.vol)} vol point${Math.abs(m.vol) === 1 ? '' : 's'}`);
  parts.push(m.days === 0 ? 'right now' : m.days === 1 ? 'overnight' : `over a ${m.days}-day weekend`);
  return parts.join(', ');
}

/** Which Greek moved the PnL most, in a line for the feedback. */
export function lesson(item: GreeksItem): string {
  const p = item.parts;
  const biggest = (['delta', 'gamma', 'vega', 'theta'] as const).reduce((a, b) => (Math.abs(p[b]) > Math.abs(p[a]) ? b : a));
  const short = item.book.gamma < 0;
  switch (biggest) {
    case 'gamma':
      return short
        ? 'Gamma did the damage: a short-gamma book loses on a big move whichever way it goes, by half gamma times the move squared.'
        : 'Gamma paid: a long-gamma book makes money on a big move either way, half gamma times the move squared.';
    case 'delta':
      return 'Delta drove it: the direction of the move against your delta decides most of a day like this.';
    case 'vega':
      return `Vega led: a ${Math.abs(item.move.vol)}-point change in IV times ${rupees(Math.abs(item.book.vega), false)} per point outweighed the move in spot.`;
    case 'theta':
      return item.book.theta > 0 ? 'Theta led: the book was paid for time passing, and the move was too small to undo it.' : 'Theta led: time decay cost more than the move made back.';
  }
}
