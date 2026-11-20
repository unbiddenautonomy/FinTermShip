/**
 * Call It: decks of true/false claims, built from the syllabus.
 * Four sources, all checked against the term cards:
 *  - written: hand-written misconception claims (a term's tf items and data/modes/claims.json, on the term's card)
 *  - definition: the term with its own gloss (true) or one of its hand-written near misses (false)
 *  - swap: a confusable term's gloss given as this term's (false)
 *  - number: a worked sum with its right answer (true) or a wrong option (false)
 * Every deck is split evenly between true and false so guessing can't win.
 */
import { hasCard, termById, writtenByTerm } from '../content';
import { dueTermIds } from '../scheduler';
import { shuffle, tidyOption, type Rng } from '../questions';
import { isWeak } from '../weak';
import type { Progress, Term, WrittenClaim } from '../types';

export type ClaimSource = 'written' | 'definition' | 'swap' | 'number';

export interface Claim {
  termId: string;
  text: string;
  truth: boolean;
  why: string;
  source: ClaimSource;
}

const pick = <T,>(items: T[], rng: Rng): T => items[Math.floor(rng() * items.length)];

/**
 * Where claims look things up: other terms (for swaps), a term's written claims, and which
 * confusables' glosses may be swapped in. The app looks in the cards it holds; the server
 * (worker/callit.ts) looks in the whole syllabus, swapping in only glosses the learner has reached.
 */
export interface ClaimLookup {
  term: (id: string) => Term | undefined;
  written: (id: string) => WrittenClaim[];
  canSwap: (id: string) => boolean;
}
const inApp: ClaimLookup = { term: (id) => termById.get(id), written: (id) => writtenByTerm.get(id) ?? [], canSwap: hasCard };

/** Every claim a term can give that has the wanted truth value. */
export function claimsFor(term: Term, truth: boolean, look: ClaimLookup = inApp): Claim[] {
  const out: Claim[] = [];
  const gloss = tidyOption(term.short);
  for (const f of term.tf ?? []) if (f.a === truth) out.push({ termId: term.id, text: f.s, truth, why: f.why ?? `${term.term}: ${gloss}.`, source: 'written' });
  for (const c of look.written(term.id)) if (c.a === truth) out.push({ termId: term.id, text: c.s, truth, why: c.why, source: 'written' });
  if (truth) out.push({ termId: term.id, text: `${term.term}: ${gloss}.`, truth, why: term.definition, source: 'definition' });
  else
    for (const w of term.wrong)
      out.push({ termId: term.id, text: `${term.term}: ${tidyOption(w)}.`, truth, why: `${term.term} is ${term.short.charAt(0).toLowerCase()}${term.short.slice(1)}. ${term.definition}`, source: 'definition' });
  if (!truth)
    for (const id of term.confusables) {
      const other = look.term(id);
      // A confusable the learner hasn't reached has no gloss to swap in.
      if (!other || !look.canSwap(id) || other.short.toLowerCase() === term.short.toLowerCase()) continue;
      // An overlapping term's gloss fits this one too ("PAT: A company's profit"), so the claim wouldn't be false.
      if (term.overlaps?.includes(id) || other.overlaps?.includes(term.id)) continue;
      // Skip a parent concept named inside the term ("long" in "long and wrong"): its gloss can be partly true.
      const [x, y] = [term.term.toLowerCase(), other.term.toLowerCase()];
      if (x.includes(y) || y.includes(x)) continue;
      out.push({ termId: term.id, text: `${term.term}: ${tidyOption(other.short)}.`, truth, why: `That describes ${other.term}. ${term.term}: ${gloss}.`, source: 'swap' });
    }
  for (const c of term.calcs ?? []) {
    if (truth) out.push({ termId: term.id, text: `${c.q} Answer: ${c.options[c.answer]}.`, truth, why: c.why, source: 'number' });
    else for (const [i, o] of c.options.entries()) if (i !== c.answer) out.push({ termId: term.id, text: `${c.q} Answer: ${o}.`, truth, why: c.why, source: 'number' });
  }
  return out;
}

/** One claim about a term with the wanted truth value, as a deck would deal it. */
export function dealClaim(term: Term, truth: boolean, rng: Rng, look: ClaimLookup = inApp): Claim {
  return choose(claimsFor(term, truth, look), rng);
}

/** Prefer hand-written claims, then swaps and sums, then plain definitions. */
function choose(cands: Claim[], rng: Rng): Claim {
  const r = rng();
  const by = (s: ClaimSource) => cands.filter((c) => c.source === s);
  const written = by('written');
  if (written.length && r < 0.45) return pick(written, rng);
  const tricky = [...by('swap'), ...by('number')];
  if (tricky.length && r < 0.8) return pick(tricky, rng);
  return pick(cands, rng);
}

export const DECK_SIZE = 12;

/**
 * The terms a deck asks about: met terms, due ones first, then weak ones, then the rest at random.
 * Their cards may not be here yet; `deckWants` says what to fetch first.
 */
export function deckTermIds(p: Progress, today: string, rng: Rng, size: number): string[] {
  const met = Object.keys(p.terms).filter((id) => termById.has(id) && p.terms[id].step > 0);
  if (met.length < 4) return [];
  const due = new Set(dueTermIds(p, today));
  const weak = new Set(met.filter((id) => isWeak(p.terms[id])));
  const ordered = [
    ...shuffle(met.filter((id) => due.has(id)), rng),
    ...shuffle(met.filter((id) => !due.has(id) && weak.has(id)), rng),
    ...shuffle(met.filter((id) => !due.has(id) && !weak.has(id)), rng),
  ];
  return ordered.slice(0, Math.min(size, ordered.length));
}

/**
 * A deck from terms the learner has met, built in the app from the cards it holds. The live
 * deck is dealt by the server instead (worker/callit.ts), with the same terms and claims.
 * Half the cards are true and half false. Returns fewer cards when fewer than 4 terms are met,
 * and leaves out a term whose card didn't come.
 */
export function buildDeck(p: Progress, today: string, rng: Rng, size = DECK_SIZE): Claim[] {
  const ids = deckTermIds(p, today, rng, size).filter((id) => hasCard(id));
  const truths = shuffle(ids.map((_, i) => i % 2 === 0), rng);
  return ids.map((id, i) => choose(claimsFor(termById.get(id)!, truths[i]), rng));
}
