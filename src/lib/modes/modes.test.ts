import { describe, expect, it } from 'vitest';
import tickerData from '../../data/modes/tickers.json';
import network from '../../data/modes/network.json';
import { categories, termById } from '../content';
import { addDays } from '../dates';
import { seededRng } from '../questions';
import { introduce, graduate, newProgress, KNOWN_STEP } from '../scheduler';
import { mergeProgress } from '../sync';
import type { Progress } from '../types';
import type { WrittenClaim } from '../types';
import claimsJson from '../../data/modes/claims.json';
import { buildDeck, claimsFor } from './claims';
import { marketIndex, quote, snapshotCurrent, snapshotIndex, watchlist } from './exchange';
import { kpis, landingMode, MIN_HALF_LIFE, recordAnswer, strength, STRENGTH_FLOOR, type ModeId } from './knowledge';
import { interchangesAt, transferPuzzle } from './transfer';
import { lines } from './plans';
import { modesOn } from './ids';

const writtenClaims = claimsJson as WrittenClaim[];

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
    const q = recordAnswer(p, { termId: 'theta', correct: true, evidence: 'strong', mode: 'callit' }, today);
    expect(q.terms.theta.step).toBe(2);
    expect(q.terms.theta.correct).toBe(p.terms.theta.correct + 1);
  });

  it('a due term gets a review, and a second answer the same day is only practice', () => {
    const p = learner(ids, 2, today);
    const once = recordAnswer(p, { termId: 'theta', correct: true, evidence: 'strong', mode: 'lines' }, today);
    expect(once.terms.theta.step).toBe(3);
    const twice = recordAnswer(once, { termId: 'theta', correct: true, evidence: 'strong', mode: 'exchange' }, today);
    expect(twice.terms.theta.step).toBe(3);
  });

  it('weak evidence never steps a term up, and only strong evidence reaches Known', () => {
    const p = learner(ids, KNOWN_STEP - 1, today);
    const weak = recordAnswer(p, { termId: 'delta', correct: true, evidence: 'weak', mode: 'callit' }, today);
    expect(weak.terms.delta.step).toBe(KNOWN_STEP - 1);
    const medium = recordAnswer(p, { termId: 'delta', correct: true, evidence: 'medium', mode: 'lines' }, today);
    expect(medium.terms.delta.step).toBe(KNOWN_STEP - 1);
    const strong = recordAnswer(p, { termId: 'delta', correct: true, evidence: 'strong', mode: 'exchange' }, today);
    expect(strong.terms.delta.step).toBe(KNOWN_STEP);
  });

  it('the same answers through different modes leave the same knowledge and the same KPIs', () => {
    const p = learner(ids, 2, today);
    const run = (mode: ModeId) =>
      ids.reduce((acc, id, i) => recordAnswer(acc, { termId: id, correct: i % 3 !== 0, evidence: 'strong', mode }, today), p);
    const a = run('callit');
    const b = run('exchange');
    const c = run('path');
    expect(a.terms).toEqual(b.terms);
    expect(c.terms).toEqual(b.terms);
    expect(kpis(a, today)).toEqual(kpis(b, today));
    expect(kpis(c, today)).toEqual(kpis(b, today));
    // Path keeps no tally of its own: its share is worked out from the term record.
    expect(c.modes?.path).toBeUndefined();
    expect(a.modes?.callit?.answers).toBe(ids.length);
    expect(b.modes?.exchange?.answers).toBe(ids.length);
  });

  it('wrong answers drop a term and bring it back tomorrow in every mode', () => {
    const p = learner(ids, 4, today);
    for (const mode of ['path', 'lines', 'exchange'] as ModeId[]) {
      const q = recordAnswer(p, { termId: 'bid', correct: false, evidence: 'strong', mode }, today);
      expect(q.terms.bid.step).toBe(2);
      expect(q.terms.bid.due).toBe(addDays(today, 1));
    }
  });

  it('a true/false call never moves the ladder: right is practice, wrong brings the term back tomorrow', () => {
    const p = learner(ids, 4, addDays(today, 10));
    const right = recordAnswer(p, { termId: 'bid', correct: true, evidence: 'weak', mode: 'callit' }, today);
    expect({ ...right.terms.bid, seen: 0, correct: 0 }).toEqual({ ...p.terms.bid, seen: 0, correct: 0 });
    const wrong = recordAnswer(p, { termId: 'bid', correct: false, evidence: 'weak', mode: 'callit' }, today);
    expect(wrong.terms.bid.step).toBe(4);
    expect(wrong.terms.bid.due).toBe(addDays(today, 1));
    // The pull counts as a move, so another device's untouched copy can't merge the flag away.
    expect(wrong.terms.bid.moves).toBe((p.terms.bid.moves ?? 0) + 1);
    expect(right.terms.bid.moves).toBe(p.terms.bid.moves);
    // A due term stays due for a proper review, whatever the call.
    const due = learner(ids, 3, today);
    for (const correct of [true, false]) {
      const q = recordAnswer(due, { termId: 'bid', correct, evidence: 'weak', mode: 'callit' }, today);
      expect(q.terms.bid.step).toBe(3);
      expect(q.terms.bid.due).toBe(today);
    }
  });
});

describe('landing', () => {
  it('opens in Path unless the learner picked another mode', () => {
    expect(landingMode(newProgress())).toBe('path');
    const p = newProgress();
    expect(landingMode({ ...p, settings: { ...p.settings, landing: 'exchange' } })).toBe('exchange');
    expect(landingMode({ ...p, settings: { ...p.settings, landing: 'finnections' } })).toBe('finnections');
    expect(landingMode({ ...p, settings: { ...p.settings, landing: 'nowhere' as ModeId } })).toBe('path');
  });

  it('falls back to Path when the admin switched the chosen mode off, and Path is never off', () => {
    const p = newProgress();
    const onExchange = { ...p, settings: { ...p.settings, landing: 'exchange' as ModeId } };
    expect(landingMode(onExchange, ['exchange'])).toBe('path');
    expect(landingMode(onExchange, ['callit'])).toBe('exchange');
    expect(modesOn(['callit', 'path', 'nonsense'])).toEqual(['path', 'lines', 'exchange', 'headline', 'finnections']);
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

  it('never halves faster than every few days, and never drops below the floor', () => {
    const young = learner(['vega'], 1, today).terms.vega;
    const held = strength(young, today);
    expect(Math.abs(strength(young, addDays(today, MIN_HALF_LIFE)) - held / 2)).toBeLessThanOrEqual(1);
    expect(strength(young, addDays(today, 60))).toBe(STRENGTH_FLOOR);
  });

  it('prices a shaky record below a clean one on the same step', () => {
    const clean = learner(['vega'], 4, addDays(today, 5)).terms.vega;
    const shaky = { ...clean, correct: 3, wrong: 3 };
    expect(strength(shaky, today)).toBeLessThan(strength(clean, today));
    expect(strength(shaky, today)).toBeGreaterThan(strength({ ...clean, step: 3 }, today));
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

  it('split every met term into exactly one of Learning, Due or Known, as the stations and stocks do', () => {
    const p = learner(['bid', 'ask', 'spread', 'theta', 'vega'], 5, addDays(today, 3));
    // A known term that falls due is Due, not Known, until it is reviewed.
    const q = { ...p, terms: { ...p.terms, ask: { ...p.terms.ask, due: today }, vega: { ...p.terms.vega, step: 2 } } };
    const k = kpis(q, today);
    expect(k).toMatchObject({ met: 5, known: 3, due: 1, learning: 1 });
    expect(k.known + k.due + k.learning).toBe(k.met);
    const quotes = watchlist(q, today);
    expect(quotes.filter((x) => x.blueChip)).toHaveLength(k.known);
    expect(quotes.filter((x) => x.falling)).toHaveLength(k.due);
  });

  it('count every due term, past the daily review cap, so Due matches the falling stocks', () => {
    const ids = categories.filter((c) => c.phase !== 3).flatMap((c) => c.terms.map((t) => t.id)).slice(0, 120);
    const p = learner(ids, 3, today);
    const open = new Set(ids);
    expect(kpis(p, today).due).toBe(watchlist(p, today).filter((x) => x.falling && open.has(x.termId)).length);
    expect(kpis(p, today).due).toBeGreaterThan(80);
  });

  it('make the Exchange index Strength × Coverage × 10', () => {
    const p = learner(['bid', 'ask', 'spread', 'theta'], 4, addDays(today, -9));
    const k = kpis(p, today);
    expect(marketIndex(p, today)).toBeCloseTo(k.strength * k.coverage * 10, 0);
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

  it('keeps every area between 35% and 65% true, counting hand-written claims and true/false items together', () => {
    for (const c of categories) {
      const truths = [...c.terms.flatMap((t) => (t.tf ?? []).map((f) => f.a)), ...writtenClaims.filter((w) => c.terms.some((t) => t.id === w.term)).map((w) => w.a)];
      if (truths.length < 10) continue;
      const share = truths.filter(Boolean).length / truths.length;
      expect(share, c.id).toBeGreaterThanOrEqual(0.35);
      expect(share, c.id).toBeLessThanOrEqual(0.65);
    }
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
  const interchanges = allTerms.flatMap((t) => interchangesAt(t.id).filter((o) => t.id < o).map((o) => ({ a: t.id, b: o })));

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

  it('draws the network map from the interchanges, unit by unit', () => {
    const unitOf = new Map(allTerms.map((t) => [t.id, t.unit]));
    const links = new Map<string, number>();
    for (const i of interchanges) {
      const [x, y] = [unitOf.get(i.a)!, unitOf.get(i.b)!].sort();
      links.set(`${x}|${y}`, (links.get(`${x}|${y}`) ?? 0) + 1);
    }
    expect(network.unitLinks.map((l) => [`${l.a}|${l.b}`, l.n])).toEqual([...links].sort(([a], [b]) => (a < b ? -1 : 1)));
  });

  it('builds a transfer puzzle whose answers match the right glosses', () => {
    const i = interchanges[0];
    const t = transferPuzzle(i.a, i.b, seededRng(3))!;
    expect(t.glosses[t.answer[0]].toLowerCase()).toContain(termById.get(i.a)!.short.slice(1, 10).toLowerCase());
  });
});

describe('Recall Exchange', () => {
  it('gives every term a unique ticker', () => {
    const tickers = tickerData as Record<string, string>;
    for (const t of allTerms) expect(tickers[t.id], t.id).toBeTruthy();
    for (const t of allTerms) expect(termById.get(t.id)!.ticker, t.id).toBe(tickers[t.id]);
    expect(new Set(Object.values(tickers)).size).toBe(Object.keys(tickers).length);
  });

  it('prices a term at its strength and lists due terms as falling, first', () => {
    const p = learner(['bid', 'ask', 'theta'], 4, addDays(today, 2));
    const late = { ...p, terms: { ...p.terms, theta: { ...p.terms.theta, due: addDays(today, -3) } } };
    // A visit yesterday sets the baseline; theta loses another day overdue since then.
    const seen = snapshotIndex(late, addDays(today, -1));
    const list = watchlist(seen, today);
    expect(list[0].termId).toBe('theta');
    expect(list[0].falling).toBe(true);
    expect(list[0].change).toBeLessThan(0);
    expect(quote(seen, 'bid', today)!.blueChip).toBe(true);
  });

  it('shows a right review as a rise and a wrong one as a fall, against the last visit', () => {
    const p = snapshotIndex(learner(['bid', 'ask'], 2, today), addDays(today, -1));
    const up = recordAnswer(p, { termId: 'bid', correct: true, evidence: 'strong', mode: 'exchange' }, today);
    const down = recordAnswer(p, { termId: 'ask', correct: false, evidence: 'strong', mode: 'exchange' }, today);
    expect(quote(up, 'bid', today)!.change).toBeGreaterThan(0);
    expect(quote(down, 'ask', today)!.change).toBeLessThan(0);
    // With no earlier visit there is nothing to compare with.
    expect(quote(learner(['bid'], 2, today), 'bid', today)!.change).toBe(0);
  });

  it('marks terms listed since the last visit as new', () => {
    const p = snapshotIndex(learner(['bid'], 2, addDays(today, 3)), addDays(today, -1));
    const q = graduate(introduce(p, 'ask', today), 'ask', today);
    expect(quote(q, 'ask', today)!.fresh).toBe(true);
    expect(quote(q, 'bid', today)!.fresh).toBe(false);
  });

  it('lifts the index when a new term is learned', () => {
    const p = learner(['bid', 'ask', 'spread'], 5, addDays(today, 10));
    const more = graduate(introduce(p, 'theta', today), 'theta', today);
    expect(marketIndex(more, today)).toBeGreaterThan(marketIndex(p, today));
    expect(marketIndex(newProgress(), today)).toBe(0);
  });

  it('keeps one index reading a day, merged across devices without loss', () => {
    const p = learner(['bid', 'ask'], 3, addDays(today, 2));
    const a = snapshotIndex(p, today);
    const b = snapshotIndex(p, addDays(today, 1));
    const m1 = mergeProgress(a, b);
    const m2 = mergeProgress(b, a);
    expect(Object.keys(m1.modes!.exchange!.closes!).sort()).toEqual([today, addDays(today, 1)]);
    expect(m1.modes!.exchange!.marks!.day).toBe(addDays(today, 1));
    expect(m1.modes).toEqual(m2.modes);
  });

  it('moves the baseline forward only when the day changes', () => {
    const p = learner(['bid'], 3, addDays(today, 2));
    const y = snapshotIndex(p, addDays(today, -1));
    const t1 = snapshotIndex(y, today);
    const t2 = snapshotIndex(t1, today);
    expect(t2.modes!.exchange!.prevMarks!.day).toBe(addDays(today, -1));
    expect(snapshotCurrent(t2, today)).toBe(true);
  });
});

describe('answer sources', () => {
  it('gives Path whatever the other modes did not record', async () => {
    const { answerSources, recordAnswer } = await import('./knowledge');
    const { newProgress, introduce, graduate, recordPractice } = await import('../scheduler');
    let p = newProgress();
    p = graduate(introduce(p, 'bid', '2026-01-01'), 'bid', '2026-01-01');
    p = recordPractice(p, 'bid', true);
    p = recordPractice(p, 'bid', false);
    p = recordAnswer(p, { termId: 'bid', correct: true, evidence: 'weak', mode: 'callit' }, '2026-01-05');
    const s = Object.fromEntries(answerSources(p).map((x) => [x.mode, x]));
    expect(s.callit.answers).toBe(1);
    expect(s.path.answers).toBe(2);
    expect(s.path.right).toBe(1);
    expect(s.lines.answers).toBe(0);
  });
});
