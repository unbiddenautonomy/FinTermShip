import { describe, expect, it } from 'vitest';
import { areaCoreDrillIds, areaOpen } from './choose';
import { caseById, path, unitById } from './content';
import { drillUp } from './lesson';
import { fairValue, MM, newMarketGame, noiseTradeChance, playTurn, scoreGame, shownBefore, validQuote, type MarketGame, type Quote, type TurnResult } from './market';
import { casePassMark, recordLine, recordRound } from './practice';
import { seededRng } from './questions';
import { newProgress } from './scheduler';
import { currentUnit, trackTermIds } from './track';
import type { Progress } from './types';

const today = '2026-11-07';
const half = (x: number) => Math.round(x * 2) / 2;

/** Play a whole game with a quoting rule: (fair value, position) → quote. */
function play(seed: number, rule: (fair: number, pos: number) => Quote): { game: MarketGame; turns: TurnResult[] } {
  const game = newMarketGame(seededRng(seed));
  const turns: TurnResult[] = [];
  let pos = 0;
  for (let t = 1; t <= MM.turns; t++) {
    const r = playTurn(game, t, rule(fairValue(game, t), pos), pos);
    turns.push(r);
    pos = r.position;
  }
  return { game, turns };
}

function stats(rule: (fair: number, pos: number) => Quote, n = 2000) {
  let passed = 0;
  let pnl = 0;
  for (let seed = 1; seed <= n; seed++) {
    const { game, turns } = play(seed, rule);
    const s = scoreGame(game, turns);
    passed += s.passed ? 1 : 0;
    pnl += s.pnl;
  }
  return { passRate: passed / n, avgPnl: pnl / n };
}

const skewed = (width: number) => (fair: number, pos: number) => {
  const mid = half(fair - 0.5 * pos);
  return { bid: mid - width / 2, ask: mid + width / 2 };
};

describe('market game rules', () => {
  it('shows a die after turns 3 and 6, and prices fair value from the dice shown', () => {
    const game: MarketGame = { dice: [6, 1, 4], draws: Array.from({ length: MM.turns }, () => [0.9, 0.99, 0.5]) };
    expect([1, 3, 4, 6, 7, 9].map(shownBefore)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(fairValue(game, 1)).toBe(10.5);
    expect(fairValue(game, 4)).toBe(13);
    expect(fairValue(game, 7)).toBe(10.5);
  });

  it('lets an informed trader deal only with an edge of at least half a point', () => {
    // Informed trader on turn 1 knows die 1 is a 6, so the total looks like 13.
    const game: MarketGame = { dice: [6, 3, 3], draws: Array.from({ length: MM.turns }, () => [0, 0.99, 0.5]) };
    expect(playTurn(game, 1, { bid: 12, ask: 12.5 }, 0).fill).toMatchObject({ side: 'sold', price: 12.5, informed: true });
    expect(playTurn(game, 1, { bid: 12, ask: 13 }, 0).fill).toBeNull();
    expect(playTurn(game, 1, { bid: 13.5, ask: 14 }, 0).fill).toMatchObject({ side: 'bought', price: 13.5 });
  });

  it('settles every open lot at the total', () => {
    const game: MarketGame = { dice: [2, 2, 2], draws: [] };
    const q = { bid: 9, ask: 11 };
    const turns: TurnResult[] = [
      { turn: 1, fair: 10.5, quote: q, fill: { side: 'bought', price: 9, informed: false }, blocked: false, position: 1 },
      { turn: 2, fair: 10.5, quote: q, fill: { side: 'bought', price: 9, informed: true }, blocked: false, position: 2 },
      { turn: 3, fair: 10.5, quote: q, fill: { side: 'sold', price: 11, informed: false }, blocked: false, position: 1 },
    ];
    // Paid 18, received 11, and the last lot is worth the total of 6.
    expect(scoreGame(game, turns).pnl).toBe(-18 + 11 + 6);
  });

  it('never lets the position pass the limit', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { turns } = play(seed, () => ({ bid: 17, ask: 18 }));
      for (const t of turns) expect(Math.abs(t.position)).toBeLessThanOrEqual(MM.limit);
    }
  });

  it('accepts quotes on the half-point grid with the ask above the bid', () => {
    expect(validQuote({ bid: 9.5, ask: 11 })).toBe(true);
    expect(validQuote({ bid: 11, ask: 11 })).toBe(false);
    expect(validQuote({ bid: 9.25, ask: 11 })).toBe(false);
    expect(noiseTradeChance(1)).toBeGreaterThan(noiseTradeChance(3));
  });
});

describe('market game balance', () => {
  it('passes a sound strategy most of the time, and pays it', () => {
    const s = stats(skewed(2));
    expect(s.passRate).toBeGreaterThan(0.85);
    expect(s.avgPnl).toBeGreaterThan(1.5);
  });

  it('fails quotes that never move with the dice', () => {
    expect(stats(() => ({ bid: 10, ask: 11 })).passRate).toBeLessThan(0.2);
  });

  it('pays less when the spread is too tight or too wide', () => {
    const two = stats(skewed(2)).avgPnl;
    expect(stats(skewed(1)).avgPnl).toBeLessThan(0);
    expect(stats(skewed(4)).avgPnl).toBeLessThan(two);
    expect(stats(skewed(4)).passRate).toBe(0);
  });

  it('rewards leaning against your position', () => {
    const flat = (fair: number) => ({ bid: half(fair) - 1, ask: half(fair) + 1 });
    expect(stats(skewed(2)).passRate).toBeGreaterThan(stats(flat).passRate + 0.15);
  });
});

describe('games and cases on the track', () => {
  function meetAll(p: Progress, ids: string[]): Progress {
    const terms = { ...p.terms };
    for (const id of ids) terms[id] = { step: 4, due: '2099-01-01', seen: 4, correct: 4, wrong: 0, lapses: 0, trouble: false, introduced: today };
    return { ...p, terms };
  }

  it('holds up the path at the market game until it is passed', () => {
    const idx = path.findIndex((r) => r.unit.id === 's6');
    let p = meetAll(newProgress(), path.slice(0, idx).flatMap((r) => r.terms.map((t) => t.id)));
    for (const r of path.slice(0, idx)) if (r.unit.kind) p = recordRound(p, r.unit.id, 10, true, today);
    expect(currentUnit(p, today)).toBe('s6');
    expect(drillUp(p, today)).toBe('s6');
    expect(trackTermIds(p, today, 4)).toEqual([]);
    p = recordRound(p, 's6', 2, false, today, -3);
    expect(drillUp(p, today)).toBe('s6');
    p = recordRound(p, 's6', 3, true, today, 4.5);
    expect(drillUp(p, today)).not.toBe('s6');
    expect(p.drills?.s6).toMatchObject({ rounds: 2, passed: true, bestRight: 3, best: 4.5 });
    expect(recordLine(p, 's6')).toBe('Passed · best +4.5 pts');
  });

  it('counts the market game as core work for opening microstructure', () => {
    expect(areaCoreDrillIds('micro')).toEqual(['s6']);
    const core = path.filter((r) => r.category.id === 'micro' && r.pass === 1).flatMap((r) => r.terms.map((t) => t.id));
    const p = meetAll(newProgress(), core);
    expect(areaOpen(p, 'micro')).toBe(false);
    expect(areaOpen(recordRound(p, 's6', 3, true, today), 'micro')).toBe(true);
  });

  it('gives every desk case a unit and a pass mark of all but one decision', () => {
    for (const [id, c] of caseById) {
      expect(unitById.get(id)?.kind).toBe('case');
      expect(casePassMark(id)).toBe(c.steps.length - 1);
      for (const s of c.steps) expect(s.options.filter((o) => o.best)).toHaveLength(1);
    }
    expect([...caseById.keys()].sort()).toEqual(['f3', 'o7', 'x4', 'y4', 'y6']);
  });
});
