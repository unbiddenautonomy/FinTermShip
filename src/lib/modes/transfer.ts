/**
 * Term Lines: the Transfer puzzle at an interchange. Two terms from different lines that
 * people mix up; the learner matches each to its meaning, then sees how they differ.
 */
import { categoryOfTerm, getCardsVersion, hasCard, termById } from '../content';
import { shuffle, tidyOption, type Rng } from '../questions';

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

let builtAt = -1;
let byTerm = new Map<string, string[]>();

/**
 * Interchanges at a station: the terms on other lines that this term is confused with, either
 * way round. Worked out from the mix-ups of the terms the app knows, so a station only shows
 * interchanges with terms the learner has reached.
 */
export function interchangesAt(termId: string): string[] {
  if (builtAt !== getCardsVersion()) {
    const out = new Map<string, Set<string>>();
    const add = (a: string, b: string) => (out.get(a) ?? out.set(a, new Set()).get(a)!).add(b);
    for (const t of termById.values())
      for (const o of t.confusables)
        if (o !== t.id && termById.has(o) && categoryOfTerm.get(o) !== categoryOfTerm.get(t.id)) {
          add(t.id, o);
          add(o, t.id);
        }
    byTerm = new Map([...out].map(([k, v]) => [k, [...v].sort()]));
    builtAt = getCardsVersion();
  }
  return byTerm.get(termId) ?? [];
}
