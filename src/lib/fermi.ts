/**
 * Fermi estimates: estimate a size or count in a minute, scored on how many
 * powers of ten you are off. A guess within a factor of 3 either way is a hit.
 */
import fermi from '../data/fermi.json';
import { shuffle, type Rng } from './questions';

export const FERMI = {
  items: 8,
  passHits: 5,
  seconds: 60,
  /** A hit is within this many powers of ten: log10(3) ≈ 0.48, so within 3 times either way. */
  hitOrders: Math.log10(3),
};

export interface FermiItem {
  id: string;
  q: string;
  answer: number;
  unit?: string;
  how: string;
  source?: string;
  asOf?: string;
}

export const fermiItems = fermi as FermiItem[];

export function newFermiRound(rng: Rng): FermiItem[] {
  return shuffle(fermiItems, rng).slice(0, FERMI.items);
}

/** Powers of ten between the guess and the answer. */
export function ordersOff(guess: number, answer: number): number {
  return Math.abs(Math.log10(Math.max(guess, 1e-9) / answer));
}

export function fermiHit(guess: number, answer: number): boolean {
  return ordersOff(guess, answer) <= FERMI.hitOrders + 1e-9;
}

/** The values the dial steps through: 1, 1.5, 2, 3, 5 and 7 times each power of ten, from 1 to 10¹³. */
export const DIAL: number[] = (() => {
  const out: number[] = [];
  for (let k = 0; k <= 13; k++) for (const m of [1, 1.5, 2, 3, 5, 7]) out.push(Math.round(m * 10 ** k));
  return out.filter((v) => v <= 1e13);
})();

/** Indian style first, then the international one: "3 crore (30 million)". */
export function bigNumber(x: number): string {
  const indian = (() => {
    if (x >= 1e12) return `${trim(x / 1e12)} lakh crore`;
    if (x >= 1e7) return `${trim(x / 1e7)} crore`;
    if (x >= 1e5) return `${trim(x / 1e5)} lakh`;
    return Math.round(x).toLocaleString('en-IN');
  })();
  const intl = x >= 1e12 ? `${trim(x / 1e12)} trillion` : x >= 1e9 ? `${trim(x / 1e9)} billion` : x >= 1e6 ? `${trim(x / 1e6)} million` : x >= 1e5 ? `${trim(x / 1e3)} thousand` : '';
  return intl ? `${indian} (${intl})` : indian;
}

const trim = (x: number) => {
  const r = x >= 100 ? Math.round(x) : x >= 10 ? Math.round(x * 10) / 10 : Math.round(x * 100) / 100;
  return r.toLocaleString('en-IN');
};

/** "0.3 powers of ten off", for the feedback. */
export function offText(guess: number, answer: number): string {
  const off = ordersOff(guess, answer);
  const ratio = guess >= answer ? guess / answer : answer / guess;
  if (ratio < 1.15) return 'Spot on';
  const times = ratio < 10 ? `${Math.round(ratio * 10) / 10} times` : `${Math.round(ratio).toLocaleString('en-IN')} times`;
  return `${times} too ${guess > answer ? 'high' : 'low'}, ${Math.round(off * 10) / 10} powers of ten off`;
}
