import { categoryOfTerm, termById } from './content';
import type { Question, Term } from './types';

export type Rng = () => number;

/** Small seeded random generator so lessons can be reproduced in tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Wrong options that tempt: the term's own confusables first, then terms from the
 * same unit, then the same category. When `known` is given (terms the learner has
 * met, plus this lesson's new ones), known terms come first at each level, so a
 * newcomer is not shown names they have never seen.
 */
export function distractorTerms(term: Term, count: number, rng: Rng, known?: Set<string>): Term[] {
  const picked: Term[] = [];
  const seen = new Set([term.id]);
  const add = (t: Term | undefined, knownOnly: boolean) => {
    if (!t || seen.has(t.id) || picked.length >= count) return;
    if (knownOnly && known && !known.has(t.id)) return;
    seen.add(t.id);
    picked.push(t);
  };
  const cat = categoryOfTerm.get(term.id);
  const confusables = shuffle(term.confusables, rng).map((id) => termById.get(id));
  const sameUnit = cat ? shuffle(cat.terms.filter((x) => x.unit === term.unit), rng) : [];
  const sameCat = cat ? shuffle(cat.terms, rng) : [];
  const tiers = known ? [true, false] : [false];
  for (const knownOnly of tiers) {
    for (const t of confusables) add(t, knownOnly);
    for (const t of sameUnit) add(t, knownOnly);
  }
  for (const knownOnly of tiers) for (const t of sameCat) add(t, knownOnly);
  return picked;
}

function withAnswer(correct: string, wrong: string[], rng: Rng): { options: string[]; answer: number } {
  const options = shuffle([correct, ...wrong], rng);
  return { options, answer: options.indexOf(correct) };
}

/** Drop a leading article so no option stands out by its first word. */
export function tidyOption(text: string): string {
  const t = text.replace(/^(the|a|an)\s+/i, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Pick the meaning: the term's short gloss against its three hand-written near misses.
 * Glosses and near misses are written to a similar length and style, so the answer
 * can't be spotted by shape alone.
 */
export function meaningQuestion(term: Term, rng: Rng, review = false): Question {
  const wrong = shuffle(term.wrong, rng).slice(0, 3).map(tidyOption);
  return { kind: 'meaning', termId: term.id, review, ...withAnswer(tidyOption(term.short), wrong, rng) };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The definition used as a prompt in "Pick the term", with any giveaway removed:
 * a leading expansion such as "Earnings per share: ..." and any mention of the term itself.
 */
export function promptFor(term: Term): string {
  const names = [term.term, ...(term.aliases ?? [])].filter((n) => n.length > 3);
  let text = term.definition;
  const m = text.match(/^([^:]{2,80}):\s*(.+)$/s);
  if (m) {
    const head = m[1].toLowerCase();
    const words = head.split(' ').length;
    if (names.some((n) => head.includes(n.toLowerCase())) || (words >= 2 && words <= 6)) {
      text = m[2].charAt(0).toUpperCase() + m[2].slice(1);
    }
  }
  for (const n of names.sort((a, b) => b.length - a.length)) {
    text = text.replace(new RegExp(escapeRegExp(n), 'gi'), '____');
  }
  return text;
}

/** Pick the term: read the definition, choose the term (options are term ids). */
export function termQuestion(term: Term, rng: Rng, review = false, known?: Set<string>): Question {
  const wrong = distractorTerms(term, 3, rng, known).map((t) => t.id);
  return { kind: 'term', termId: term.id, review, ...withAnswer(term.id, wrong, rng) };
}

/** Fill the gap: a desk sentence with the term blanked out (options are term ids). */
export function fillQuestion(term: Term, rng: Rng, review = false, known?: Set<string>): Question {
  const wrong = distractorTerms(term, 3, rng, known).map((t) => t.id);
  return { kind: 'fill', termId: term.id, review, ...withAnswer(term.id, wrong, rng) };
}

/** Match pairs: terms on the left, short meanings shuffled on the right. */
export function matchQuestion(terms: Term[], rng: Rng): Question {
  return { kind: 'match', termIds: shuffle(terms.map((t) => t.id), rng), right: shuffle(terms.map((t) => t.id), rng) };
}

function pick<T>(items: T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

/** Work it out: a short worked sum or desk scenario that needs the term to solve. */
export function calcQuestion(term: Term, rng: Rng, review = false): Question | null {
  if (!term.calcs?.length) return null;
  const c = pick(term.calcs, rng);
  const correct = c.options[c.answer];
  const options = shuffle(c.options, rng);
  return { kind: 'calc', termId: term.id, prompt: c.q, why: c.why, options, answer: options.indexOf(correct), review };
}

/** True or false: a statement built around a common misreading of the term. */
export function tfQuestion(term: Term, rng: Rng, review = false): Question | null {
  if (!term.tf?.length) return null;
  const f = pick(term.tf, rng);
  return { kind: 'tf', termId: term.id, prompt: f.s, why: f.why, options: ['True', 'False'], answer: f.a ? 0 : 1, review };
}

/**
 * Which format a scheduled review uses, by how well the term is known.
 * Early steps check recognition; later steps make the learner use the term:
 * in a sentence, in a sum, or against a common misreading.
 */
export function reviewQuestion(term: Term, step: number, rng: Rng, known?: Set<string>): Question {
  const r = rng();
  if (step <= 1) return r < 0.5 ? meaningQuestion(term, rng, true) : termQuestion(term, rng, true, known);
  if (step === 2) return (r < 0.35 && tfQuestion(term, rng, true)) || termQuestion(term, rng, true, known);
  if (r < 0.5 && term.calcs?.length) return calcQuestion(term, rng, true)!;
  if (r > 0.8 && term.tf?.length) return tfQuestion(term, rng, true)!;
  return fillQuestion(term, rng, true, known);
}

/** A fresh version of a missed question for the retry at the end of a lesson. */
export function retryQuestion(q: Question, rng: Rng, known?: Set<string>): Question {
  if (q.kind === 'intro' || q.kind === 'match') return q;
  const t = termById.get(q.termId);
  if (!t) return q;
  switch (q.kind) {
    case 'meaning':
      return meaningQuestion(t, rng);
    case 'term':
      return termQuestion(t, rng, false, known);
    case 'fill':
      return fillQuestion(t, rng, false, known);
    case 'calc':
      // Same sum, reshuffled: the worked answer was just shown, so this checks it stuck.
      return { ...q, review: false, ...withAnswer(q.options[q.answer], q.options.filter((_, i) => i !== q.answer), rng) };
    case 'tf':
      // A second true/false would be a coin flip, so ask for the meaning instead.
      return meaningQuestion(t, rng);
  }
}
