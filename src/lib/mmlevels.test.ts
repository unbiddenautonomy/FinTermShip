import { describe, expect, it } from 'vitest';
import { path } from './content';
import { gameSpec, MARKET_LEVELS, marketLevel } from './games';
import type { Quote } from './market';
import {
  expectedTotal,
  HEADLINE,
  informedView,
  isHeadlineTurn,
  levelChecks,
  levelFair,
  LEVELS,
  newLevelGame,
  playLevelTurn,
  rivalQuote,
  scoreLevel,
  shownAt,
  type LevelGame,
  type LevelNo,
  type LevelTurn,
} from './mmlevels';
import { passRule, roundSize } from './practice';
import { seededRng } from './questions';

type Rule = (g: LevelGame, turn: number, fair: number, pos: number) => Quote;
const half = (x: number) => Math.round(x * 2) / 2;
const around = (c: number, w: number): Quote => {
  const bid = half(c - w / 2);
  return { bid, ask: bid + w };
};

function play(level: LevelNo, seed: number, rule: Rule) {
  const game = newLevelGame(level, seededRng(seed));
  const turns: LevelTurn[] = [];
  let pos = 0;
  for (let t = 1; t <= LEVELS[level].turns; t++) {
    const r = playLevelTurn(game, t, rule(game, t, levelFair(game, t), pos), pos);
    turns.push(r);
    pos = r.position;
  }
  return { game, turns, score: scoreLevel(game, turns) };
}

function stats(level: LevelNo, rule: Rule, n = 2000) {
  let passed = 0;
  let pnl = 0;
  for (let seed = 1; seed <= n; seed++) {
    const { score } = play(level, seed, rule);
    passed += score.passed ? 1 : 0;
    pnl += score.pnl;
  }
  return { passRate: passed / n, avgPnl: pnl / n };
}

/** Quote fair value minus a lean of `k` per lot held, `w` wide. */
const skewed = (w: number, k = 0.5): Rule => (_g, _t, fair, pos) => around(fair - k * pos, w);
/** Level 3: the same, but `wh` wide on the headline turn. */
const widens = (wh: number): Rule => (g, t, fair, pos) => around(fair - 0.5 * pos, isHeadlineTurn(g, t) ? wh : 2);
/** Level 5: join the rival, and improve one side by half a point to get out of a position. */
const joinAndLean: Rule = (_g, _t, fair, pos) => {
  const r = rivalQuote(fair);
  const s = pos > 0 ? -0.5 : pos < 0 ? 0.5 : 0;
  return { bid: r.bid + s, ask: r.ask + s };
};

const fixedGame = (level: LevelNo, items: number[], draw: [number, number, number, number, number], headline: LevelGame['headline'] = null): LevelGame => ({
  level,
  items,
  draws: Array.from({ length: LEVELS[level].turns }, () => draw),
  headline,
});

describe('market levels: rules', () => {
  it('prices hidden cards at the average of the cards left in the deck', () => {
    const g = fixedGame(2, [10, 9, 1, 2, 3], [0.9, 0.99, 0.5, 0.5, 0.5]);
    expect(levelFair(g, 1)).toBe(27.5);
    expect(shownAt(2, 3)).toBe(1);
    // The 10 is out, so each of the four hidden cards is worth 45 / 9 = 5.
    expect(levelFair(g, 3)).toBe(30);
    // 10 and 9 out: three hidden cards at 36 / 8 = 4.5 each.
    expect(levelFair(g, 5)).toBe(19 + 13.5);
    expect(expectedTotal(g, 5, false)).toBe(25);
  });

  it('deals five different cards from the deck', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const g = newLevelGame(2, seededRng(seed));
      expect(new Set(g.items).size).toBe(5);
      for (const c of g.items) expect(c >= 1 && c <= 10).toBe(true);
    }
  });

  it('puts one headline on a turn without a reveal, and adds it to fair value once it is out', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const g = newLevelGame(3, seededRng(seed));
      expect(HEADLINE.turns).toContain(g.headline!.turn);
      expect(LEVELS[3].revealAfter).not.toContain(g.headline!.turn);
      expect([3, 4]).toContain(Math.abs(g.headline!.shift));
    }
    const g = fixedGame(3, [2, 3, 4], [0.9, 0.99, 0.5, 0.5, 0.5], { turn: 2, shift: -4 });
    expect(levelFair(g, 2)).toBe(10.5);
    expect(levelFair(g, 3)).toBe(6.5);
    // On the headline turn, a trader who knows sees the headline, not the next die.
    expect(informedView(g, 2)).toBe(6.5);
  });

  it('settles at the dice plus the headline', () => {
    const g = fixedGame(3, [2, 3, 4], [0.9, 0.99, 0.5, 0.5, 0.5], { turn: 2, shift: 3 });
    const turns: LevelTurn[] = [
      { turn: 1, fair: 10.5, quote: { bid: 10, ask: 11 }, rival: null, fill: { side: 'bought', price: 10, lots: 1, informed: false }, rivalFill: null, blocked: false, position: 1 },
    ];
    expect(scoreLevel(g, turns).total).toBe(12);
    expect(scoreLevel(g, turns).pnl).toBe(2);
  });

  it('has traders who know the next die deal 3 lots at level 4, and turns away trades past the limit', () => {
    // Informed trader; die 1 is a 6, so the total looks like 13 and the ask at 12 gets lifted.
    const g = fixedGame(4, [6, 3, 3], [0, 0.99, 0.5, 0.9, 0.5]);
    expect(playLevelTurn(g, 1, { bid: 11, ask: 12 }, 0).fill).toMatchObject({ side: 'sold', lots: 3, informed: true });
    expect(playLevelTurn(g, 1, { bid: 11, ask: 12 }, -4)).toMatchObject({ fill: null, blocked: true, position: -4 });
    const noise = fixedGame(4, [6, 3, 3], [0.9, 0, 0.1, 0.9, 0.5]);
    expect(playLevelTurn(noise, 1, { bid: 10, ask: 11 }, 0).fill?.lots).toBe(2);
  });

  it('sends each trade to the best price, and splits ties with a coin', () => {
    const rival = rivalQuote(10.5);
    expect(rival).toEqual({ bid: 9.5, ask: 11.5 });
    // A noise buyer (way < buy chance) at a tie: the tie draw decides.
    const tieToMe = fixedGame(5, [3, 3, 3], [0.9, 0, 0.1, 0.5, 0.2]);
    const tieToRival = fixedGame(5, [3, 3, 3], [0.9, 0, 0.1, 0.5, 0.8]);
    expect(playLevelTurn(tieToMe, 1, rival, 0).fill).toMatchObject({ side: 'sold', price: 11.5 });
    const lost = playLevelTurn(tieToRival, 1, rival, 0);
    expect(lost.fill).toBeNull();
    expect(lost.rivalFill).toMatchObject({ side: 'sold', price: 11.5 });
    // A better ask wins the whole trade, a worse one gets nothing.
    expect(playLevelTurn(tieToRival, 1, { bid: 9.5, ask: 11 }, 0).fill).toMatchObject({ price: 11 });
    expect(playLevelTurn(tieToMe, 1, { bid: 9, ask: 12 }, 0).rivalFill).not.toBeNull();
  });

  it('scores each level on its own checks', () => {
    expect(levelChecks(2)).toEqual(['mid', 'width', 'flat']);
    expect(levelChecks(3)).toEqual(['mid', 'width', 'headline', 'flat']);
    expect(levelChecks(4)).toEqual(['mid', 'width', 'inventory', 'flat']);
    expect(levelChecks(5)).toEqual(['mid', 'best', 'inside', 'flat']);
    const { score } = play(5, 1, (_g, _t, fair) => around(fair, 1));
    expect(score.checks.inside).toBe(false);
    expect(score.insideTurns).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(Object.keys(score.checks)).toEqual(levelChecks(5));
  });
});

describe('market levels: balance', () => {
  it('level 2 passes quotes that price the cards left, and fails 5.5 a card', () => {
    const naive: Rule = (g, t, _fair, pos) => {
      const sh = shownAt(2, t);
      const seen = g.items.slice(0, sh).reduce((a, b) => a + b, 0);
      return around(seen + (5 - sh) * 5.5 - 0.5 * pos, 3);
    };
    expect(stats(2, skewed(3)).passRate).toBeGreaterThan(0.85);
    expect(stats(2, naive).passRate).toBeLessThan(0.4);
    expect(stats(2, skewed(1)).avgPnl).toBeLessThan(0);
  });

  it('level 3 pays for widening into the headline and fails stale quotes after it', () => {
    const wide = stats(3, widens(8));
    const narrow = stats(3, widens(2));
    expect(wide.passRate).toBeGreaterThan(0.85);
    expect(narrow.passRate).toBe(0);
    expect(wide.avgPnl).toBeGreaterThan(narrow.avgPnl + 1);
    const stale: Rule = (g, t, fair, pos) => around((g.headline && g.headline.turn < t ? fair - g.headline.shift : fair) - 0.5 * pos, isHeadlineTurn(g, t) ? 8 : 2);
    expect(stats(3, stale).passRate).toBeLessThan(0.25);
  });

  it('level 4 passes a quoter who leans and fails one who does not', () => {
    expect(stats(4, skewed(3)).passRate).toBeGreaterThan(0.85);
    expect(stats(4, skewed(3, 0)).passRate).toBeLessThan(0.6);
  });

  it('level 5 passes joining the rival and leaning, and fails quoting inside it or hiding', () => {
    expect(stats(5, joinAndLean).passRate).toBeGreaterThan(0.85);
    expect(stats(5, joinAndLean).avgPnl).toBeGreaterThan(stats(5, skewed(1)).avgPnl + 1);
    expect(stats(5, skewed(1)).passRate).toBe(0);
    expect(stats(5, skewed(4)).passRate).toBe(0);
    expect(stats(5, (_g, _t, fair) => rivalQuote(fair)).passRate).toBeLessThan(0.65);
  });
});

describe('market levels on the track', () => {
  it('gives levels 2 to 5 their own units after the first game', () => {
    const order = path.map((r) => r.unit.id);
    const ids = ['s8', 's9', 's10', 's11'];
    expect(ids.map(marketLevel)).toEqual([2, 3, 4, 5]);
    expect(marketLevel('s6')).toBe(1);
    for (let i = 0; i < ids.length; i++) {
      expect(order.indexOf(ids[i])).toBeGreaterThan(order.indexOf(i === 0 ? 's6' : ids[i - 1]));
      expect(gameSpec(ids[i])).toBe(MARKET_LEVELS[(i + 2) as LevelNo]);
      expect(roundSize(ids[i])).toBe(`${LEVELS[(i + 2) as LevelNo].turns} turns`);
      expect(passRule(ids[i])).toMatch(/^pass by quoting/);
    }
  });
});
