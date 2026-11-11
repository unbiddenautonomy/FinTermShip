import { describe, expect, it } from 'vitest';
import { path } from './content';
import { gameOf } from './games';
import { seededRng } from './questions';
import {
  applyTrades,
  breachesOf,
  FUTURES,
  judge,
  LIMITS,
  maxPoints,
  metrics,
  newRiskGame,
  RISK,
  room,
  scoreRisk,
  type Answer,
  type Limit,
  type RequestKind,
  type RiskGame,
  type Stock,
} from './risk';

const stocks: Record<string, Stock> = {
  'Bank A': { id: 'Bank A', beta: 1.2, vol: 0.02 },
  'IT A': { id: 'IT A', beta: 0.8, vol: 0.015 },
};

const games: RiskGame[] = Array.from({ length: 300 }, (_, i) => newRiskGame(seededRng(i + 1)));

function playAll(g: RiskGame, choose: (i: number) => { decision: 'approve' | 'reject'; limit: Limit | null }): Answer[] {
  return g.cases.map((c, i) => {
    const { decision, limit } = choose(i);
    return judge(c, i, decision, limit);
  });
}

describe('risk desk: the book', () => {
  it('adds up gross, net, the biggest name, margin and VaR', () => {
    const book = { 'Bank A': 30, 'IT A': -20, [FUTURES]: -10 };
    const m = metrics(book, stocks);
    expect(m.gross).toBe(60);
    expect(m.net).toBe(0);
    expect(m).toMatchObject({ name: 30, nameId: 'Bank A' });
    // 20% of the 20 short plus 12% of the 10 futures.
    expect(m.margin).toBe(5.2);
    // Market: 1.2×30 − 0.8×20 − 10 = 10, so 0.11; stock-specific 0.6 and 0.3.
    expect(m.var).toBeCloseTo(2.33 * Math.sqrt(0.11 ** 2 + 0.36 + 0.09), 1);
  });

  it('books trades and drops names that go flat', () => {
    const b = applyTrades({ 'Bank A': 30 }, [
      { name: 'Bank A', amount: -30 },
      { name: 'IT A', amount: 10 },
    ]);
    expect(b).toEqual({ 'IT A': 10 });
  });

  it('counts a breach on either side of the net range', () => {
    const base = { gross: 0, name: 0, nameId: '', var: 0, margin: 0 };
    expect(breachesOf({ ...base, net: RISK.limits.netHigh + 1 })).toEqual(['net']);
    expect(breachesOf({ ...base, net: RISK.limits.netLow - 1 })).toEqual(['net']);
    expect(breachesOf({ ...base, net: 0 })).toEqual([]);
  });
});

describe('risk desk: the requests', () => {
  it('starts every book inside its limits and close to them', () => {
    for (const g of games) {
      const m = g.cases[0].before;
      expect(breachesOf(m)).toEqual([]);
      expect(m.gross).toBeGreaterThan(0.8 * RISK.limits.gross - 1);
    }
  });

  it('has four requests that break a limit and four that break none, each clear of the lines', () => {
    let single = 0;
    for (const g of games) {
      expect(g.cases).toHaveLength(RISK.requests);
      expect(g.cases.filter((c) => c.breaches.length > 0)).toHaveLength(RISK.breaches);
      single += g.cases.filter((c) => c.breaches.length === 1).length;
      for (const c of g.cases) {
        expect(c.breaches.length).toBeLessThanOrEqual(2);
        for (const l of LIMITS) {
          const r = room(c.after, l);
          if (c.breaches.includes(l)) expect(r).toBeLessThanOrEqual(-RISK.slack[l] + 1e-9);
          else expect(r).toBeGreaterThanOrEqual(RISK.slack[l] - 1e-9);
        }
        for (const t of c.request.trades) expect(Math.abs(t.amount) % 5).toBe(0);
      }
    }
    // Most breaches break one limit; the rest break two that move together.
    expect(single / (games.length * RISK.breaches)).toBeGreaterThan(0.4);
  });

  it('counts naming either limit when a trade breaks two', () => {
    const c = games.flatMap((g) => g.cases).find((x) => x.breaches.length === 2)!;
    for (const l of c.breaches) expect(judge(c, 0, 'reject', l)).toMatchObject({ right: true, named: true, points: 2 });
  });

  it('books only the clean requests', () => {
    for (const g of games.slice(0, 50)) {
      for (let i = 1; i < g.cases.length; i++) {
        const prev = g.cases[i - 1];
        const want = prev.breaches.length ? prev.book : applyTrades(prev.book, prev.request.trades);
        expect(g.cases[i].book).toEqual(want);
      }
    }
  });

  it('uses every limit and every kind of request', () => {
    const limits = new Set<Limit>();
    const kinds = new Set<RequestKind>();
    for (const g of games) for (const c of g.cases) {
      c.breaches.forEach((l) => limits.add(l));
      kinds.add(c.request.kind);
    }
    expect([...limits].sort()).toEqual([...LIMITS].sort());
    expect(kinds.size).toBe(8);
  });
});

describe('risk desk: scoring', () => {
  it('passes a perfect desk and fails one that approves everything or rejects everything', () => {
    for (const g of games.slice(0, 100)) {
      const perfect = scoreRisk(g.cases, playAll(g, (i) => (g.cases[i].breaches.length ? { decision: 'reject', limit: g.cases[i].breaches[0] } : { decision: 'approve', limit: null })));
      expect(perfect).toMatchObject({ points: maxPoints(g.cases), passed: true });
      expect(scoreRisk(g.cases, playAll(g, () => ({ decision: 'approve', limit: null }))).passed).toBe(false);
      expect(scoreRisk(g.cases, playAll(g, () => ({ decision: 'reject', limit: 'gross' }))).passed).toBe(false);
    }
  });

  it('fails a desk that rejects the right trades but never names the limit', () => {
    const g = games[0];
    const s = scoreRisk(g.cases, playAll(g, (i) => (g.cases[i].breaches.length ? { decision: 'reject', limit: LIMITS.find((l) => !g.cases[i].breaches.includes(l))! } : { decision: 'approve', limit: null })));
    expect(s.right).toBe(RISK.requests);
    expect(s.passed).toBe(false);
  });

  it('fails a desk that approves one breach even with every other point', () => {
    const g = games[1];
    const first = g.cases.findIndex((c) => c.breaches.length);
    const s = scoreRisk(
      g.cases,
      playAll(g, (i) => (i === first ? { decision: 'approve', limit: null } : g.cases[i].breaches.length ? { decision: 'reject', limit: g.cases[i].breaches[0] } : { decision: 'approve', limit: null })),
    );
    expect(s.points).toBe(maxPoints(g.cases) - 2);
    expect(s.passed).toBe(false);
  });

  it('comes after the risk meeting unit', () => {
    const order = path.map((r) => r.unit.id);
    expect(gameOf('q15')).toBe('risk');
    expect(order.indexOf('q15')).toBeGreaterThan(order.indexOf('q12'));
  });
});
