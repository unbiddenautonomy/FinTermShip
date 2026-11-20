import skeleton from '../data/skeleton.json';
import { CARD_FIELDS, type Card, type Category, type PracticeKind, type Progress, type TalkItem, type Term, type TermStub, type Unit, type WrittenClaim } from './types';

/**
 * The syllabus as the app knows it. The app ships with a skeleton only
 * (src/data/skeleton.json): areas and units, and how many terms each unit has.
 * A term's name comes from the server once the learner reaches it (`addTerms`,
 * from src/lib/terms.ts), and what it means, its examples and its questions on
 * its card (src/lib/cards.ts). So the app's files never list the syllabus.
 *
 * The Worker and the tests load every term at once (src/lib/syllabus.ts), so the
 * same code reads the whole syllabus there. Code the app runs must not need a
 * term it hasn't been given: it counts with `unitSize` instead of listing terms.
 */
const blankBody = () => ({ short: '', definition: '', examples: [] as string[], fill: '', wrong: [] as string[] });

export const categories: Category[] = (skeleton.categories as unknown as Omit<Category, 'terms'>[]).map((c) => ({ ...c, terms: [] }));

export const termById = new Map<string, Term>();
export const unitById = new Map<string, Unit & { categoryId: string }>();
export const categoryOfTerm = new Map<string, Category>();
/** Each unit's known terms, in teaching order. The path's rows share these lists. */
const unitTerms = new Map<string, Term[]>();
/** A term's place in its area, for keeping teaching order as terms arrive. */
const place = new Map<string, number>();

for (const cat of categories) {
  for (const u of cat.units) {
    unitById.set(u.id, { ...u, categoryId: cat.id });
    unitTerms.set(u.id, []);
  }
}

/** How many terms a unit has, whether or not the app knows them yet. 0 for a drill, game or case. */
export function unitSize(unitId: string): number {
  return unitById.get(unitId)?.size ?? 0;
}

/** How many terms an area has, whether or not the app knows them yet. */
export function areaSize(categoryId: string): number {
  return categories.find((c) => c.id === categoryId)?.units.reduce((n, u) => n + (u.size ?? 0), 0) ?? 0;
}

/**
 * How many of a unit's terms the learner has met. Every met term is known (the app is given the
 * learner's met terms at sign-in), so this counts right in the app as on the server.
 */
export function metInUnit(p: Progress, unitId: string): number {
  return (unitTerms.get(unitId) ?? []).filter((t) => p.terms[t.id]).length;
}

/** How many of a unit's terms are still to meet. */
export function unitLeft(p: Progress, unitId: string): number {
  return Math.max(0, unitSize(unitId) - metInUnit(p, unitId));
}

const byPlace = (a: Term, b: Term) => place.get(a.id)! - place.get(b.id)!;

/**
 * Learn these terms' names, units and mix-ups. A term already known keeps its card, and takes
 * the new mix-ups (the server lists only terms the learner has reached, so they grow).
 */
export function addTerms(stubs: TermStub[]): void {
  let changed = false;
  const touched = new Set<Term[]>();
  for (const s of stubs) {
    const unit = unitById.get(s.unit);
    if (!unit) continue;
    const { n, ...fields } = s;
    const old = termById.get(s.id);
    if (old) {
      old.confusables = fields.confusables;
      if (fields.overlaps) old.overlaps = fields.overlaps;
      if (fields.near) old.near = fields.near;
      changed = true;
      continue;
    }
    const t = { ...blankBody(), ...fields } as Term;
    const cat = categories.find((c) => c.id === unit.categoryId)!;
    place.set(t.id, n);
    termById.set(t.id, t);
    categoryOfTerm.set(t.id, cat);
    cat.terms.push(t);
    unitTerms.get(unit.id)!.push(t);
    touched.add(cat.terms).add(unitTerms.get(unit.id)!);
    changed = true;
  }
  for (const list of touched) list.sort(byPlace);
  if (changed) {
    cardsVersion++;
    for (const f of cardListeners) f();
  }
}

/** Forget every term and card (signing in as someone else on this device). */
export function clearTerms(): void {
  clearCards();
  termById.clear();
  categoryOfTerm.clear();
  place.clear();
  for (const c of categories) c.terms.length = 0;
  for (const list of unitTerms.values()) list.length = 0;
  cardsVersion++;
  for (const f of cardListeners) f();
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

/** What a case's unit sheet shows before it starts: its setup (not for phase 3) and how many decisions it has. */
export const caseSummary = new Map<string, { setup?: string; steps: number }>(Object.entries((skeleton as { cases: Record<string, { setup?: string; steps: number }> }).cases));

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
      path.push({ unit, category: cat, pass, terms: unitTerms.get(unit.id)! });
    }
  }
}

/** Every known term in path order. In the app, only the terms the learner has been given. */
export function pathTermIds(): string[] {
  return path.flatMap((p) => p.terms.map((t) => t.id));
}

/** Known terms of passes 1 and 2: everything a learner can reach without opening phase 3. */
export function mainTermIds(): string[] {
  return path.filter((p) => p.pass !== 3).flatMap((p) => p.terms.map((t) => t.id));
}

export function coreTermIds(): string[] {
  return path.filter((p) => p.pass === 1).flatMap((p) => p.terms.map((t) => t.id));
}

/** A unit's term ids in teaching order. */
export function termIdsOfUnit(unitId: string): string[] {
  return path.find((p) => p.unit.id === unitId)?.terms.map((t) => t.id) ?? [];
}

export function termName(id: string): string {
  return termById.get(id)?.term ?? id;
}
