import { describe, expect, it } from 'vitest';
import metro from '../../data/modes/metro.json';
import { categories, termById } from '../content';
import { addDays } from '../dates';
import { seededRng } from '../questions';
import { introduce, graduate, newProgress, KNOWN_STEP } from '../scheduler';
import { mergeProgress } from '../sync';
import type { Progress } from '../types';
import { buildDeck, claimsFor, writtenClaims } from './claims';
import { quote, snapshotIndex, tickers, watchlist } from './exchange';
import { kpis, recordAnswer, strength, type ModeId } from './knowledge';
import { interchanges, transferPuzzle } from './transfer';

const today = '2026-11-13';
const allTerms = categories.flatMap((c) => c.terms);

/** Meet some terms and set them at a step, due on a given day. */
function learner(ids: string[], step: number, due: string): Progress {
  let p = newProgress();
  for (const id of ids) p = graduate(introduce(p, id, addDays(today, -30)), id, addDays(today, -30));
  for (const id of ids) p = { ...p, terms: { ...p.terms, [id]: { ...p.terms[id], step, due } } };
  return p;
}

describe('one answer, one memory, whatever the mode', () => {
  const ids = ['bid', 'ask', 'theta', 'delta', 'lakh', 'crore'];

  it('a term that is not due only gets practice: the ladder does not move', () => {
    const p = learner(ids, 2, addDays(today, 3));
    const q = recordAnswer(p, { termId: 'theta', correct: true, ms: 2000, evidence: 'strong', mode: 'callit' }, today);
    expect(q.terms.theta.step).toBe(2);
    expect(q.terms.theta.correct).toBe(p.terms.theta.correct + 1);
  });

  it('a due term gets a review, and a second answer the same day is only practice', () => {
    const p = learner(ids, 2, today);
    const once = recordAnswer(p, { termId: 'theta', correct: true, ms: 2000, evidence: 'strong', mode: 'lines' }, today);
    expect(once.terms.theta.step).toBe(3);
    const twice = recordAnswer(once, { termId: 'theta', correct: true, ms: 2000, evidence: 'strong', mode: 'exchange' }, today);
    expect(twice.terms.theta.step).toBe(3);
  });

  it('weak evidence never steps a term up, and only strong evidence reaches Known', () => {
    const p = learner(ids, KNOWN_STEP - 1, today);
    const weak = recordAnswer(p, { termId: 'delta', correct: true, ms: 1000, evidence: 'weak', mode: 'callit' }, today);
    expect(weak.terms.delta.step).toBe(KNOWN_STEP - 1);
    const medium = recordAnswer(p, { termId: 'delta', correct: true, ms: 1000, evidence: 'medium', mode: 'lines' }, today);
    expect(medium.terms.delta.step).toBe(KNOWN_STEP - 1);
    const strong = recordAnswer(p, { termId: 'delta', correct: true, ms: 1000, evidence: 'strong', mode: 'exchange' }, today);
    expect(strong.terms.delta.step).toBe(KNOWN_STEP);
  });

  it('the same answers through different modes leave the same knowledge and the same KPIs', () => {
    const p = learner(ids, 2, today);
    const run = (mode: ModeId) =>
      ids.reduce((acc, id, i) => recordAnswer(acc, { termId: id, correct: i % 3 !== 0, ms: 3000, evidence: 'strong', mode }, today), p);
    const a = run('callit');
    const b = run('exchange');
    expect(a.terms).toEqual(b.terms);
    expect(kpis(a, today)).toEqual(kpis(b, today));
    expect(a.modes?.callit?.answers).toBe(ids.length);
    expect(b.modes?.exchange?.answers).toBe(ids.length);
  });

  it('wrong answers drop a term and bring it back tomorrow in every mode', () => {
    const p = learner(ids, 4, today);
    const q = recordAnswer(p, { termId: 'bid', correct: false, ms: 1000, evidence: 'weak', mode: 'callit' }, today);
    expect(q.terms.bid.step).toBe(2);
    expect(q.terms.bid.due).toBe(addDays(today, 1));
  });
});

describe('strength', () => {
  it('holds until a term is due, then halves for each interval overdue', () => {
    const s = learner(['vega'], 3, today).terms.vega;
    const held = strength(s, today);
    expect(strength(s, addDays(today, -5))).toBe(held);
    expect(strength(s, addDays(today, 7))).toBe(Math.round(held / 2));
    expect(strength(undefined, today)).toBe(0);
  });

  it('runs from 0 to 100', () => {
    const top = learner(['vega'], 6, addDays(today, 1)).terms.vega;
    expect(strength(top, today)).toBe(100);
  });
});

describe('KPIs', () => {
  it('count known, due, strength and coverage from the shared record only', () => {
    const p = learner(['bid', 'ask', 'spread', 'theta'], 4, addDays(today, 1));
    const late = { ...p, terms: { ...p.terms, theta: { ...p.terms.theta, step: 2, due: today } } };
    const k = kpis(late, today);
    expect(k.met).toBe(4);
    expect(k.known).toBe(3);
    expect(k.due).toBe(1);
    expect(k.coverage).toBeCloseTo(4 / k.open);
    expect(k.strength).toBeGreaterThan(0);
  });

  it('leave phase 3 out until it opens', () => {
    const k = kpis(newProgress(), today);
    const phase3 = categories.filter((c) => c.phase === 3).reduce((n, c) => n + c.terms.length, 0);
    expect(k.open).toBe(allTerms.length - phase3);
  });
});

describe('Call It claims', () => {
  it('every term can make both a true and a false claim', () => {
    for (const t of allTerms) {
      expect(claimsFor(t, true).length, t.id).toBeGreaterThan(0);
      expect(claimsFor(t, false).length, t.id).toBeGreaterThan(0);
    }
  });

  it('hand-written claims point at real terms and are balanced between true and false', () => {
    for (const c of writtenClaims) expect(termById.has(c.term), c.id).toBe(true);
    const truths = writtenClaims.filter((c) => c.a).length;
    expect(Math.abs(truths / writtenClaims.length - 0.5)).toBeLessThan(0.05);
    expect(new Set(writtenClaims.map((c) => c.id)).size).toBe(writtenClaims.length);
  });

  it('a deck only uses met terms and is split evenly between true and false', () => {
    const ids = allTerms.slice(0, 40).map((t) => t.id);
    const p = learner(ids, 3, today);
    for (let seed = 1; seed < 20; seed++) {
      const deck = buildDeck(p, today, seededRng(seed));
      expect(deck).toHaveLength(12);
      expect(deck.filter((c) => c.truth)).toHaveLength(6);
      for (const c of deck) expect(ids).toContain(c.termId);
      expect(new Set(deck.map((c) => c.termId)).size).toBe(12);
    }
  });

  it('needs a few met terms before dealing', () => {
    expect(buildDeck(newProgress(), today, seededRng(1))).toEqual([]);
  });
});

describe('Term Lines map', () => {
  const lines = metro.lines;

  it('puts every term on exactly one line, in the order Path teaches it', () => {
    const stations = lines.flatMap((l) => l.stops.filter((s) => 'term' in s).map((s) => (s as { term: string }).term));
    expect(stations.length).toBe(allTerms.length);
    expect(new Set(stations).size).toBe(allTerms.length);
    for (const c of categories) {
      const line = lines.find((l) => l.id === c.id)!;
      const want = c.units.flatMap((u) => (u.kind && u.kind !== 'terms' ? [`depot:${u.id}`] : c.terms.filter((t) => t.unit === u.id).map((t) => t.id)));
      const got = line.stops.map((s) => ('term' in s ? s.term : `depot:${(s as { depot: string }).depot}`));
      expect(got, c.id).toEqual(want);
    }
  });

  it('puts every game, drill and case on the map as a depot', () => {
    const depots = new Set(lines.flatMap((l) => l.stops.filter((s) => 'depot' in s).map((s) => (s as { depot: string }).depot)));
    for (const c of categories) for (const u of c.units) if (u.kind && u.kind !== 'terms') expect(depots.has(u.id), u.id).toBe(true);
  });

  it('only joins lines at real confusables between different areas', () => {
    for (const i of interchanges) {
      const a = termById.get(i.a)!;
      const b = termById.get(i.b)!;
      expect(a.confusables.includes(b.id) || b.confusables.includes(a.id)).toBe(true);
      expect(categories.find((c) => c.terms.includes(a))).not.toBe(categories.find((c) => c.terms.includes(b)));
    }
  });

  it('connects every line to the rest of the network', () => {
    const catOf = new Map(categories.flatMap((c) => c.terms.map((t) => [t.id, c.id] as const)));
    const adj = new Map<string, Set<string>>();
    for (const i of interchanges) {
      const [x, y] = [catOf.get(i.a)!, catOf.get(i.b)!];
      adj.set(x, (adj.get(x) ?? new Set()).add(y));
      adj.set(y, (adj.get(y) ?? new Set()).add(x));
    }
    const withTerms = categories.filter((c) => c.terms.length).map((c) => c.id);
    const seen = new Set([withTerms[0]]);
    const queue = [withTerms[0]];
    while (queue.length) {
      for (const n of adj.get(queue.shift()!) ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        queue.push(n);
      }
    }
    expect([...seen].sort()).toEqual([...withTerms].sort());
  });

  it('builds a transfer puzzle whose answers match the right glosses', () => {
    const i = interchanges[0];
    const t = transferPuzzle(i.a, i.b, seededRng(3))!;
    expect(t.glosses[t.answer[0]].toLowerCase()).toContain(termById.get(i.a)!.short.slice(1, 10).toLowerCase());
  });
});

describe('Recall Exchange', () => {
  it('gives every term a unique ticker', () => {
    for (const t of allTerms) expect(tickers[t.id], t.id).toBeTruthy();
    expect(new Set(Object.values(tickers)).size).toBe(Object.keys(tickers).length);
  });

  it('prices a term at its strength and lists due terms as falling, first', () => {
    const p = learner(['bid', 'ask', 'theta'], 4, addDays(today, 2));
    const late = { ...p, terms: { ...p.terms, theta: { ...p.terms.theta, due: addDays(today, -3) } } };
    const list = watchlist(late, today);
    expect(list[0].termId).toBe('theta');
    expect(list[0].falling).toBe(true);
    expect(list[0].change).toBeLessThan(0);
    expect(quote(late, 'bid', today)!.blueChip).toBe(true);
  });

  it('keeps one index reading a day, merged across devices without loss', () => {
    const p = learner(['bid', 'ask'], 3, addDays(today, 2));
    const a = snapshotIndex(p, today);
    const b = snapshotIndex(p, addDays(today, 1));
    const m1 = mergeProgress(a, b);
    const m2 = mergeProgress(b, a);
    expect(Object.keys(m1.modes!.exchange!.history!).sort()).toEqual([today, addDays(today, 1)]);
    expect(m1.modes).toEqual(m2.modes);
  });
});
