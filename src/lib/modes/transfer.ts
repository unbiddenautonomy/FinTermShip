/**
 * Term Lines: the Transfer puzzle at an interchange. Two terms from different lines that
 * people mix up; the learner matches each to its meaning, then sees how they differ.
 */
import metro from '../../data/modes/metro.json';
import { hasCard, termById } from '../content';
import { shuffle, tidyOption, type Rng } from '../questions';

export interface Interchange {
  a: string;
  b: string;
  both: boolean;
}

export const interchanges = metro.interchanges as Interchange[];

export interface Transfer {
  termIds: [string, string];
  /** The two glosses in shown order; answer[i] is the index of the gloss that belongs to termIds[i]. */
  glosses: string[];
  answer: [number, number];
  why: string;
}

export function transferPuzzle(a: string, b: string, rng: Rng): Transfer | null {
  const x = termById.get(a);
  const y = termById.get(b);
  // Both glosses are needed: a term not reached yet has none here.
  if (!x || !y || !hasCard(a) || !hasCard(b)) return null;
  const glosses = shuffle([tidyOption(x.short), tidyOption(y.short)], rng);
  return {
    termIds: [a, b],
    glosses,
    answer: [glosses.indexOf(tidyOption(x.short)), glosses.indexOf(tidyOption(y.short))],
    why: `${x.term}: ${tidyOption(x.short)}. ${y.term}: ${tidyOption(y.short)}.`,
  };
}

/** Interchanges at a station: the terms on other lines that this term is confused with. */
export function interchangesAt(termId: string): string[] {
  return interchanges.filter((i) => i.a === termId || i.b === termId).map((i) => (i.a === termId ? i.b : i.a));
}
