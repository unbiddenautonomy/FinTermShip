import { categoryOfTerm, talkByTerm, talkItems, talkTerms, termById } from './content';
import type { FillContext, Question, TalkItem, Term } from './types';

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

/** Terms listed as confusable with this one, in either direction. */
let confusedWith: Map<string, Set<string>> | null = null;
const nearCache = new Map<string, Set<string>>();

/**
 * Terms too close to this one to be a fair wrong option in an example sentence:
 * confusables in either direction, and terms of the same area that either
 * definition names (a DII's definition names mutual funds, so "mutual fund
 * buying" would fit a DII sentence too).
 */
function closeTo(term: Term): Set<string> {
  const cached = nearCache.get(term.id);
  if (cached) return cached;
  if (!confusedWith) {
    confusedWith = new Map();
    const link = (a: string, b: string) => {
      if (!confusedWith!.has(a)) confusedWith!.set(a, new Set());
      confusedWith!.get(a)!.add(b);
    };
    for (const t of termById.values()) {
      for (const c of t.confusables) {
        link(t.id, c);
        link(c, t.id);
      }
    }
  }
  const near = new Set(confusedWith.get(term.id) ?? []);
  const names = (x: Term) => [x.term, ...(x.aliases ?? [])].filter((n) => n.length >= 2);
  // Whether y's definition or gloss names x, plurals included.
  const named = (x: Term, y: Term) => names(x).some((n) => phraseHits(`${y.definition} ${y.short}`, n, true).length);
  for (const t of categoryOfTerm.get(term.id)?.terms ?? []) {
    if (t.id !== term.id && (named(t, term) || named(term, t))) near.add(t.id);
  }
  nearCache.set(term.id, near);
  return near;
}

/**
 * Wrong options that tempt: the term's own confusables first, then terms from the
 * same unit, then the same category. When `known` is given (terms the learner has
 * met, plus this lesson's new ones), known terms come first at each level, so a
 * newcomer is not shown names they have never seen.
 *
 * With `loose`, close terms (confusables either way) are left out. Example sentences
 * were written to show the term in use, not to tell it apart from its near twins,
 * so a near twin might fit the blank just as well.
 */
export function distractorTerms(term: Term, count: number, rng: Rng, known?: Set<string>, loose = false): Term[] {
  const picked: Term[] = [];
  const seen = new Set([term.id, ...(loose ? closeTo(term) : [])]);
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

/** A whole-phrase match for a name, case-insensitive. Written without lookbehind for older Safari. */
function phraseRe(name: string, plural = false): RegExp {
  return new RegExp(`(^|[^\\w-])(${escapeRegExp(name)}${plural ? '(?:s|es)?' : ''})(?![\\w-])`, 'gi');
}

function phraseHits(text: string, name: string, plural = false): { start: number; end: number; text: string }[] {
  return [...text.matchAll(phraseRe(name, plural))].map((m) => {
    const start = (m.index ?? 0) + m[1].length;
    return { start, end: start + m[2].length, text: m[2] };
  });
}

const contextCache = new Map<string, FillContext[]>();

/**
 * The term's example sentences that can be turned into a fill question: the term's
 * own name appears exactly once as a whole phrase, it doesn't follow "a" or "an"
 * (the article would give away how the answer starts), it isn't part of a longer
 * term's name (the "stop-loss" in "trailing stop-loss"), and no plural or alias of
 * the term is left in the sentence to give the answer away.
 */
export function exampleFills(term: Term): FillContext[] {
  const cached = contextCache.get(term.id);
  if (cached) return cached;
  const name = term.term;
  const lower = name.toLowerCase();
  const longer: string[] = [];
  if (name.length >= 2) {
    for (const t of termById.values()) {
      if (t.id === term.id) continue;
      for (const n of [t.term, ...(t.aliases ?? [])]) {
        if (n.length > name.length && phraseHits(n, lower).length) longer.push(n);
      }
    }
  }
  const aliases = (term.aliases ?? []).filter((a) => a.length >= 2 && a.toLowerCase() !== lower);
  const out: FillContext[] = [];
  term.examples.forEach((sentence, from) => {
    if (name.length < 2) return;
    const hits = phraseHits(sentence, name);
    if (hits.length !== 1) return;
    const [h] = hits;
    if (/(^|[^\w])(a|an)\s+$/i.test(sentence.slice(0, h.start))) return;
    if (longer.some((n) => phraseHits(sentence, n).some((m) => m.start <= h.start && m.end >= h.end))) return;
    const text = `${sentence.slice(0, h.start)}____${sentence.slice(h.end)}`;
    // No other form of the name ("Variances ... ____") or alias left to give the answer away.
    if (phraseHits(text, name, true).length || aliases.some((a) => phraseHits(text, a, true).length)) return;
    out.push({ text, blank: h.text, from });
  });
  contextCache.set(term.id, out);
  return out;
}

/**
 * Fill the gap (options are term ids). By default the term's own fill sentence,
 * written so that only the term fits. With `fromExample`, one of the term's example
 * sentences instead, if one can be blanked: the learner meets the term as it is used
 * at the desk, in research, by risk and with clients. `avoid` skips one example, so
 * a retry doesn't repeat the sentence just missed.
 */
export function fillQuestion(term: Term, rng: Rng, review = false, known?: Set<string>, fromExample = false, avoid?: number): Question {
  const contexts = fromExample ? exampleFills(term).filter((c) => c.from !== avoid) : [];
  const context = contexts.length ? pick(contexts, rng) : undefined;
  const wrong = distractorTerms(term, 3, rng, known, !!context).map((t) => t.id);
  return { kind: 'fill', termId: term.id, review, ...withAnswer(term.id, wrong, rng), ...(context ? { context } : {}) };
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

/** Decode it, say it like the desk, respond in the room or spot the misuse: one talk item, options shuffled. */
export function talkQuestion(item: TalkItem, rng: Rng, review = false): Question {
  return { kind: 'talk', format: item.format, itemId: item.id, termId: item.term, review, ...withAnswer(item.options[0], item.options.slice(1), rng) };
}

/** Every term the item needs is known (all count when `known` isn't given). */
function talkFits(item: TalkItem, known?: Set<string>): boolean {
  return !known || talkTerms(item).every((id) => known.has(id));
}

/** A talk item that practises this term and needs nothing the learner hasn't met, if there is one. */
export function talkFor(term: Term, rng: Rng, known?: Set<string>): TalkItem | null {
  const fits = (talkByTerm.get(term.id) ?? []).filter((i) => talkFits(i, known));
  return fits.length ? pick(fits, rng) : null;
}

/**
 * A talk item for a lesson: one that touches the given terms if any fits. Otherwise,
 * now and then, any item on terms the learner knows, so the few items open early on
 * don't repeat in every lesson. Null when nothing fits.
 */
export function talkAbout(termIds: string[], known: Set<string>, rng: Rng, skip: Set<string> = new Set()): TalkItem | null {
  const fits = talkItems.filter((i) => !skip.has(i.id) && talkFits(i, known));
  const near = fits.filter((i) => talkTerms(i).some((id) => termIds.includes(id)));
  if (near.length) return pick(near, rng);
  return fits.length && rng() < 0.4 ? pick(fits, rng) : null;
}

/** Listen and pick: the term is said aloud and the learner picks its meaning. Only for terms with a spoken form. */
export function listenQuestion(term: Term, rng: Rng, review = false): Question | null {
  if (!term.said) return null;
  const wrong = shuffle(term.wrong, rng).slice(0, 3).map(tidyOption);
  return { kind: 'listen', termId: term.id, review, ...withAnswer(tidyOption(term.short), wrong, rng) };
}

/**
 * Which format a scheduled review uses, by how well the term is known.
 * Early steps check recognition (by ear too, when `listen` is on); later steps
 * make the learner use the term: in a sentence, in a sum, in desk talk, or
 * against a common misreading.
 */
export function reviewQuestion(term: Term, step: number, rng: Rng, known?: Set<string>, listen = false): Question {
  const r = rng();
  if (step <= 1) {
    if (listen && r < 0.2 && term.said) return listenQuestion(term, rng, true)!;
    return r < 0.5 ? meaningQuestion(term, rng, true) : termQuestion(term, rng, true, known);
  }
  if (step === 2) return (r < 0.35 && tfQuestion(term, rng, true)) || termQuestion(term, rng, true, known);
  if (r < 0.5 && term.calcs?.length) return calcQuestion(term, rng, true)!;
  if (r > 0.8 && term.tf?.length) return tfQuestion(term, rng, true)!;
  if (r >= 0.45 && r < 0.7) {
    const item = talkFor(term, rng, known);
    if (item) return talkQuestion(item, rng, true);
  }
  // Half the time, one of the term's example sentences instead of its fill sentence.
  return fillQuestion(term, rng, true, known, rng() < 0.5);
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
      // A different sentence: an example after the fill sentence, another example or the fill sentence after an example.
      return q.context ? fillQuestion(t, rng, false, known, rng() < 0.5, q.context.from) : fillQuestion(t, rng, false, known, true);
    case 'calc':
      // Same sum, reshuffled: the worked answer was just shown, so this checks it stuck.
      return { ...q, review: false, ...withAnswer(q.options[q.answer], q.options.filter((_, i) => i !== q.answer), rng) };
    case 'tf':
      // A second true/false would be a coin flip, so ask for the meaning instead.
      return meaningQuestion(t, rng);
    case 'talk':
      // Same item, reshuffled: the best answer was just shown, so this checks it stuck.
      return { ...q, review: false, ...withAnswer(q.options[q.answer], q.options.filter((_, i) => i !== q.answer), rng) };
    case 'listen':
      // The term's name was just shown, so ask for its meaning by sight.
      return meaningQuestion(t, rng);
  }
}
