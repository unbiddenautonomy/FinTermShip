/**
 * Call It: decks of true/false claims, built from the syllabus.
 * Four sources, all checked against the term cards:
 *  - written: hand-written misconception claims (a term's tf items and data/modes/claims.json)
 *  - definition: the term with its own gloss (true) or one of its hand-written near misses (false)
 *  - swap: a confusable term's gloss given as this term's (false)
 *  - number: a worked sum with its right answer (true) or a wrong option (false)
 * Every deck is split evenly between true and false so guessing can't win.
 */
import extra from '../../data/modes/claims.json';
import { termById } from '../content';
import { dueTermIds } from '../scheduler';
import { shuffle, tidyOption, type Rng } from '../questions';
import { isWeak } from '../weak';
import type { Progress, Term } from '../types';

export interface WrittenClaim {
  id: string;
  term: string;
  s: string;
  a: boolean;
  why: string;
}

export type ClaimSource = 'written' | 'definition' | 'swap' | 'number';

export interface Claim {
  termId: string;
  text: string;
  truth: boolean;
  why: string;
  source: ClaimSource;
}

export const writtenClaims = extra as WrittenClaim[];
const writtenByTerm = new Map<string, WrittenClaim[]>();
for (const c of writtenClaims) writtenByTerm.set(c.term, [...(writtenByTerm.get(c.term) ?? []), c]);

const pick = <T,>(items: T[], rng: Rng): T => items[Math.floor(rng() * items.length)];

/** Every claim a term can give that has the wanted truth value. */
export function claimsFor(term: Term, truth: boolean): Claim[] {
  const out: Claim[] = [];
  const gloss = tidyOption(term.short);
  for (const f of term.tf ?? []) if (f.a === truth) out.push({ termId: term.id, text: f.s, truth, why: f.why ?? `${term.term}: ${gloss}.`, source: 'written' });
  for (const c of writtenByTerm.get(term.id) ?? []) if (c.a === truth) out.push({ termId: term.id, text: c.s, truth, why: c.why, source: 'written' });
  if (truth) out.push({ termId: term.id, text: `${term.term}: ${gloss}.`, truth, why: term.definition, source: 'definition' });
  else
    for (const w of term.wrong)
      out.push({ termId: term.id, text: `${term.term}: ${tidyOption(w)}.`, truth, why: `${term.term} is ${term.short.charAt(0).toLowerCase()}${term.short.slice(1)}. ${term.definition}`, source: 'definition' });
  if (!truth)
    for (const id of term.confusables) {
      const other = termById.get(id);
      if (!other || other.short.toLowerCase() === term.short.toLowerCase()) continue;
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
 * A deck from terms the learner has met: due terms first, then weak ones, then the rest at random.
 * Half the cards are true and half false. Returns fewer cards when fewer than 4 terms are met.
 */
export function buildDeck(p: Progress, today: string, rng: Rng, size = DECK_SIZE): Claim[] {
  const met = Object.keys(p.terms).filter((id) => termById.has(id) && p.terms[id].step > 0);
  if (met.length < 4) return [];
  const due = new Set(dueTermIds(p, today));
  const weak = new Set(met.filter((id) => isWeak(p.terms[id])));
  const ordered = [
    ...shuffle(met.filter((id) => due.has(id)), rng),
    ...shuffle(met.filter((id) => !due.has(id) && weak.has(id)), rng),
    ...shuffle(met.filter((id) => !due.has(id) && !weak.has(id)), rng),
  ];
  const ids = ordered.slice(0, Math.min(size, ordered.length));
  const truths = shuffle(ids.map((_, i) => i % 2 === 0), rng);
  return ids.map((id, i) => choose(claimsFor(termById.get(id)!, truths[i]), rng));
}
