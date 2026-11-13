import outline from '../data/outline.json';
import { CARD_FIELDS, type Card, type Category, type DeskCase, type PracticeKind, type TalkItem, type Term, type Unit, type WrittenClaim } from './types';

/**
 * The syllabus as the app ships it: areas, units and each term's name, from
 * src/data/outline.json. What a term means, its examples and its questions
 * come on its card, which the server sends once the learner reaches the term
 * (src/lib/cards.ts). Until then the term's text fields are empty and
 * `hasCard` is false.
 */
const blankBody = () => ({ short: '', definition: '', examples: [] as string[], fill: '', wrong: [] as string[] });

export const categories: Category[] = (outline.categories as unknown as Category[]).map((c) => ({ ...c, terms: c.terms.map((t) => ({ ...blankBody(), ...t }) as Term) }));

export const termById = new Map<string, Term>();
export const unitById = new Map<string, Unit & { categoryId: string }>();
export const categoryOfTerm = new Map<string, Category>();

for (const cat of categories) {
  for (const u of cat.units) unitById.set(u.id, { ...u, categoryId: cat.id });
  for (const t of cat.terms) {
    termById.set(t.id, t);
    categoryOfTerm.set(t.id, cat);
  }
}

/** Areas the quant switch opens and moves to the front of the path, in this order. */
export const QUANT_AREAS = ['skills', 'quant', 'options', 'instruments', 'micro', 'execution'];

export function isQuantArea(categoryId: string): boolean {
  return QUANT_AREAS.includes(categoryId);
}

/** Phase 3 areas: trading strategies, at the end of the track behind the password and the readiness test. */
export const PHASE3_AREAS = categories.filter((c) => c.phase === 3).map((c) => c.id);

export function isPhase3Area(categoryId: string): boolean {
  return PHASE3_AREAS.includes(categoryId);
}

export function categoryOfUnit(unitId: string): Category | undefined {
  const u = unitById.get(unitId);
  return u && categories.find((c) => c.id === u.categoryId);
}

/** The kind of a practice unit (drill, game or case), or null for a unit of terms. */
export function practiceKind(unitId: string): PracticeKind | null {
  const k = unitById.get(unitId)?.kind;
  return k && k !== 'terms' ? k : null;
}

/** Practice units sit on the track like term units but have no terms: drills, games and desk cases. */
export function isPracticeUnit(unitId: string): boolean {
  return practiceKind(unitId) !== null;
}

/** Talk items (decode it, say it like the desk, respond in the room, spot the misuse), by id and by the term they practise. They come on their term's card. */
export const talkItems: TalkItem[] = [];
export const talkById = new Map<string, TalkItem>();
export const talkByTerm = new Map<string, TalkItem[]>();

/** Hand-written Call It claims, by the term they test. They come on their term's card. */
export const writtenByTerm = new Map<string, WrittenClaim[]>();

// ---------- Term cards ----------
const carded = new Set<string>();
let cardsVersion = 0;
const cardListeners = new Set<() => void>();

/** Whether the term's card has arrived: its meaning, examples and questions are here. */
export function hasCard(id: string): boolean {
  return carded.has(id);
}

/** A term of the syllabus whose card hasn't arrived: leave it out of reviews and lists until it does. */
export function awaitingCard(id: string): boolean {
  return termById.has(id) && !carded.has(id);
}

/** A term's one-line gloss once its card is here; before that, the unit it comes in. */
export function glossOrUnit(term: Term): string {
  return carded.has(term.id) ? term.short : `In ${unitById.get(term.unit)?.name ?? 'a later unit'}`;
}

/** How many cards have arrived. */
export function cardCount(): number {
  return carded.size;
}

/** Fill terms in from their cards. Cards for unknown terms are skipped. */
export function applyCards(cards: Record<string, Card>): void {
  let added = 0;
  for (const [id, card] of Object.entries(cards)) {
    const t = termById.get(id);
    if (!t) continue;
    const { claims, talk, ...body } = card;
    Object.assign(t, body);
    writtenByTerm.set(id, claims ?? []);
    for (const old of talkByTerm.get(id) ?? []) {
      talkById.delete(old.id);
      talkItems.splice(talkItems.indexOf(old), 1);
    }
    talkByTerm.set(id, talk ?? []);
    for (const i of talk ?? []) {
      talkItems.push(i);
      talkById.set(i.id, i);
    }
    if (!carded.has(id)) added++;
    carded.add(id);
  }
  if (added || Object.keys(cards).length) {
    cardsVersion++;
    for (const f of cardListeners) f();
  }
}

/** Empty every card again (tests, and signing in as someone else on this device). */
export function clearCards(): void {
  for (const id of carded) {
    const t = termById.get(id)!;
    for (const k of CARD_FIELDS) delete (t as unknown as Record<string, unknown>)[k];
    Object.assign(t, blankBody());
  }
  carded.clear();
  talkItems.length = 0;
  talkById.clear();
  talkByTerm.clear();
  writtenByTerm.clear();
  cardsVersion++;
  for (const f of cardListeners) f();
}

/** For React: re-render when cards arrive. */
export function subscribeCards(f: () => void): () => void {
  cardListeners.add(f);
  return () => cardListeners.delete(f);
}
export const getCardsVersion = () => cardsVersion;

/** Every term a talk item needs the learner to know. */
export function talkTerms(i: TalkItem): string[] {
  return [i.term, ...(i.also ?? [])];
}

/** Desk cases in full, by unit id. A case comes from the server when the learner opens it (src/lib/packs.ts). */
export const caseById = new Map<string, DeskCase>();

/** What a case's unit sheet shows before it starts: its setup (not for phase 3) and how many decisions it has. */
export const caseSummary = new Map<string, { setup?: string; steps: number }>(Object.entries((outline as { cases: Record<string, { setup?: string; steps: number }> }).cases));

export function isCore(termId: string): boolean {
  const t = termById.get(termId);
  return !!t && !!unitById.get(t.unit)?.core;
}

/**
 * The learning path. Pass 1 (the core sweep) takes the core units of every
 * category in order; pass 2 takes the remaining units, again in category order;
 * pass 3 is phase 3, the strategy areas, which stay locked until opened.
 */
export const path: { unit: Unit; category: Category; pass: 1 | 2 | 3; terms: Term[] }[] = [];
for (const pass of [1, 2, 3] as const) {
  for (const cat of categories) {
    if ((cat.phase === 3) !== (pass === 3)) continue;
    for (const unit of cat.units) {
      if (pass !== 3 && unit.core !== (pass === 1)) continue;
      path.push({ unit, category: cat, pass, terms: cat.terms.filter((t) => t.unit === unit.id) });
    }
  }
}

export const pathTermIds: string[] = path.flatMap((p) => p.terms.map((t) => t.id));

/** Terms of passes 1 and 2: everything a learner can reach without opening phase 3. */
export const mainTermIds: string[] = path.filter((p) => p.pass !== 3).flatMap((p) => p.terms.map((t) => t.id));

export const coreTermIds: string[] = path.filter((p) => p.pass === 1).flatMap((p) => p.terms.map((t) => t.id));

/** A unit's term ids in teaching order. */
export function termIdsOfUnit(unitId: string): string[] {
  return path.find((p) => p.unit.id === unitId)?.terms.map((t) => t.id) ?? [];
}

export function termName(id: string): string {
  return termById.get(id)?.term ?? id;
}
