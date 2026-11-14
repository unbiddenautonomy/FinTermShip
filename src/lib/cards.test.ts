import { afterEach, describe, expect, it } from 'vitest';
import outline from '../data/outline.json';
import { buildCards, fullCategories } from './cardData';
import { planTermIds } from './cards';
import { buildPractice, buildTest } from './choose';
import { applyCards, awaitingCard, categories, clearCards, hasCard, talkByTerm, termById, writtenByTerm } from './content';
import { buildLesson, type LessonPlan } from './lesson';
import { MOCKS, newMock } from './mock';
import { buildDeck, claimsFor, deckWants } from './modes/claims';
import { buildDefend, buildListing, buildRally, buildRevisit, buildRide, lines } from './modes/plans';
import { buildPhase3Test } from './phase3';
import { definitionNames, seededRng } from './questions';
import { dueTermIds, graduate, introduce, newProgress } from './scheduler';
import { CARD_FIELDS, type Card, type Progress } from './types';
import { buildWeakSpots, weakSpots } from './weak';

const all: Record<string, Card> = Object.fromEntries(buildCards());
const today = '2026-11-13';
const some = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, all[id]]));

// Each test may empty the cards; put every card back after it.
afterEach(() => {
  clearCards();
  applyCards(all);
});

describe('the outline the app ships with', () => {
  it('names every term of the syllabus in order, and holds nothing from a card', () => {
    expect(categories.map((c) => c.id)).toEqual(fullCategories.map((c) => c.id));
    for (const [i, c] of fullCategories.entries()) expect(categories[i].terms.map((t) => t.id)).toEqual(c.terms.map((t) => t.id));
    const keys = new Set<string>();
    for (const c of (outline as { categories: { terms: Record<string, unknown>[] }[] }).categories) for (const t of c.terms) for (const k of Object.keys(t)) keys.add(k);
    for (const k of CARD_FIELDS) expect(keys.has(k), k).toBe(false);
  });

  it('carries the near twins that only the definitions show, worked out the way questions do', () => {
    for (const c of fullCategories) {
      for (const t of c.terms) {
        const want = c.terms.filter((o) => o.id !== t.id && (definitionNames(o, t) || definitionNames(t, o))).map((o) => o.id);
        expect(termById.get(t.id)!.near ?? [], t.id).toEqual(want);
      }
    }
  });

  it('has one card for every term, and every written claim and talk item on its term’s card', () => {
    expect(Object.keys(all).sort()).toEqual(fullCategories.flatMap((c) => c.terms.map((t) => t.id)).sort());
    for (const [id, card] of Object.entries(all)) {
      for (const c of card.claims ?? []) expect(c.term).toBe(id);
      for (const i of card.talk ?? []) expect(i.term).toBe(id);
    }
  });
});

describe('term cards', () => {
  it('fill a term in when its card comes, and empty it again', () => {
    clearCards();
    const t = termById.get('short-gamma')!;
    expect(hasCard(t.id)).toBe(false);
    expect(awaitingCard(t.id)).toBe(true);
    expect([t.short, t.definition, t.fill, t.examples, t.wrong]).toEqual(['', '', '', [], []]);
    expect(talkByTerm.get(t.id)).toBeUndefined();
    applyCards(some([t.id]));
    expect(hasCard(t.id)).toBe(true);
    expect(t.definition).toBe(all[t.id].definition);
    expect(talkByTerm.get(t.id)!.length).toBe(all[t.id].talk!.length);
    clearCards();
    // The name stays (it is on the map); what it means goes.
    expect(t.term).not.toBe('');
    expect(t.definition).toBe('');
    expect(writtenByTerm.size).toBe(0);
  });

  it('let a new learner’s first lesson be built, its cards fetched, and the same lesson built again', () => {
    clearCards();
    const p = newProgress();
    const make = (seed: number) => buildLesson(p, today, seededRng(seed));
    const first = make(7)!;
    const need = planTermIds(first).filter((id) => !hasCard(id));
    expect(need.length).toBeGreaterThan(0);
    expect(need).toEqual(expect.arrayContaining(first.newIds));
    applyCards(some(need));
    const again = make(7)!;
    expect(again.newIds).toEqual(first.newIds);
    expect(planTermIds(again).every(hasCard)).toBe(true);
    // Options are names (from the outline) or the asked term's own text: none is blank.
    for (const q of again.questions) if ('options' in q) for (const o of q.options) expect(o.trim(), q.kind).not.toBe('');
  });

  it('count every met term as due or weak before its card is here, and deal Call It once its cards come', () => {
    clearCards();
    let p: Progress = newProgress();
    const metIds = ['bid', 'ask', 'spread', 'ltp', 'liquidity', 'volume'];
    for (const id of metIds) p = graduate(introduce(p, id, '2026-11-01'), id, '2026-11-02');
    p = { ...p, terms: Object.fromEntries(Object.entries(p.terms).map(([id, s]) => [id, { ...s, due: '2026-11-10', wrong: 3, correct: 1, trouble: true }])) };
    // Nothing is on the device yet: due and weak still count them, and a lesson fetches their cards.
    expect(dueTermIds(p, today).sort()).toEqual([...metIds].sort());
    expect(weakSpots(p).sort()).toEqual([...metIds].sort());
    // Call It says which cards a deck needs (its terms and their met confusables), then deals the same deck.
    expect(buildDeck(p, today, seededRng(3))).toEqual([]);
    const wants = deckWants(p, today, seededRng(3));
    expect(wants.every((id) => metIds.includes(id))).toBe(true);
    applyCards(some(wants));
    const deck = buildDeck(p, today, seededRng(3));
    expect(deck.length).toBe(metIds.length);
    // A card that didn't come is left out of the deck.
    clearCards();
    applyCards(some(['bid', 'ask', 'spread', 'ltp']));
    for (const c of buildDeck(p, today, seededRng(3))) expect(['bid', 'ask', 'spread', 'ltp']).toContain(c.termId);
  });

  it('never swap in the gloss of a term the learner hasn’t reached', () => {
    clearCards();
    const t = termById.get('bid')!;
    applyCards(some([t.id]));
    expect(claimsFor(t, false).filter((c) => c.source === 'swap')).toEqual([]);
    applyCards(some(t.confusables));
    expect(claimsFor(t, false).some((c) => c.source === 'swap')).toBe(true);
  });

  it('let every kind of round be built before any card has come, without failing', () => {
    clearCards();
    let p: Progress = newProgress();
    for (const id of ['bid', 'ask', 'spread', 'ltp', 'liquidity']) p = graduate(introduce(p, id, '2026-11-01'), id, '2026-11-02');
    const rng = () => seededRng(5);
    const plans: (LessonPlan | null | undefined)[] = [
      buildLesson(newProgress(), today, rng()),
      buildLesson(p, today, rng(), true),
      buildWeakSpots(p, rng()),
      buildPractice(p, 'b1', rng()),
      buildTest('basics', rng()),
      buildPhase3Test(rng()),
      buildRide(p, lines[0].id, 0, today, rng())?.plan,
      buildRevisit(p, lines[0].id, today, rng()),
      buildRally(p, 'basics', today, rng()),
      buildListing(p, today, rng()),
      buildDefend(p, ['bid', 'ask'], today, rng()),
    ];
    expect(plans.filter(Boolean).length).toBeGreaterThan(5);
    expect(buildDeck(p, today, rng())).toEqual([]);
    for (const m of MOCKS) expect(() => newMock(m, rng())).not.toThrow();
    // A sums round has nothing to ask until its terms are reached.
    expect(newMock(MOCKS.find((m) => m.round === 'Markets and options')!, rng())).toEqual([]);
  });
});
