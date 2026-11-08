import { describe, expect, it } from 'vitest';
import { categories, path, unitById } from './content';
import { DIAL, FERMI, fermiHit, fermiItems, newFermiRound, ordersOff, bigNumber } from './fermi';
import { GAMES, gameOf } from './games';
import { GREEKS, newGreeksRound, pnlParts, rupees, sumParts } from './greeks';
import { annualVol, correlation, excessKurtosis, GUESS, isHit, newGuessRound, normal, stdev, type GuessItem } from './guess';
import { judge, KELLY, kellyFraction, newKellyGame, pathAt, scoreKelly, settle } from './kelly';
import { allowed, emptyLegs, keepsHolds, makeChain, makeTarget, newPayoffRound, PAYOFF, payoffAt, payoffStats, solves, TARGET_IDS, type Leg } from './payoff';
import { finishGame, passRule, recordLine, roundSize } from './practice';
import { seededRng, type Rng } from './questions';
import { newProgress } from './scheduler';
import type { GameId } from './types';

const today = '2026-11-08';
const rate = (n: number, f: (seed: number) => boolean) => {
  let k = 0;
  for (let s = 1; s <= n; s++) if (f(s)) k++;
  return k / n;
};

describe('games on the track', () => {
  const gameUnits = categories.flatMap((c) => c.units.filter((u) => u.kind === 'game'));

  it('every game unit names a game, and every game has a unit', () => {
    for (const u of gameUnits) expect(Object.keys(GAMES), u.id).toContain(u.game);
    expect(new Set(gameUnits.map((u) => u.game))).toEqual(new Set(Object.keys(GAMES) as GameId[]));
  });

  it('describes each game for the unit sheet and the path', () => {
    for (const u of gameUnits) {
      expect(roundSize(u.id), u.id).toMatch(/^\d+ \w+/);
      expect(passRule(u.id), u.id).toMatch(/^pass /);
      expect(recordLine(newProgress(), u.id), u.id).not.toBe('');
    }
  });

  it('sits next to the units it builds on', () => {
    const order = path.map((r) => r.unit.id);
    const before = (a: string, b: string) => expect(order.indexOf(a), `${a} before ${b}`).toBeLessThan(order.indexOf(b));
    before('o3', 'o10');
    before('o10', 'o4');
    before('o8', 'o9');
    before('o9', 'o7');
    before('q2', 'q8');
    before('k6', 'k7');
    before('z3', 'z6');
    expect(path.find((r) => r.unit.id === 'z6')?.pass).toBe(3);
    expect(gameOf('s6')).toBe('market');
    expect(gameOf('o1')).toBeNull();
    expect(unitById.get('k7')?.core).toBe(false);
  });

  it('records a round and pays XP for the score and the pass', () => {
    const first = finishGame(newProgress(), 'o9', today, 5, true);
    expect(first.firstPass).toBe(true);
    expect(first.xp).toBe(5 + 5 + 5);
    expect(first.progress.drills?.o9).toMatchObject({ rounds: 1, passed: true, bestRight: 5 });
    const again = finishGame(first.progress, 'o9', today, 3, false);
    expect(again.firstPass).toBe(false);
    expect(again.progress.drills?.o9).toMatchObject({ rounds: 2, passed: true, bestRight: 5 });
  });
});

describe('payoff builder', () => {
  const chain = makeChain(24_500);
  const leg = (kind: Leg['kind'], strike: number, qty: number): Leg => ({ kind, strike, qty });

  it('prices the chain so put-call parity holds exactly', () => {
    for (const [i, k] of chain.strikes.entries()) {
      expect(chain.call[i] - chain.put[i]).toBe(chain.fut - k);
      expect(chain.put[i]).toBeGreaterThan(0);
    }
    // Calls get cheaper as the strike rises; the ATM call is a few hundred points for a week.
    for (let i = 1; i < 5; i++) expect(chain.call[i]).toBeLessThan(chain.call[i - 1]);
    expect(chain.call[2]).toBeGreaterThan(100);
    expect(chain.call[2]).toBeLessThan(300);
  });

  it('works out breakevens and the best and worst case', () => {
    const atm = chain.strikes[2];
    const c = chain.call[2];
    const p = chain.put[2];
    const call = payoffStats(chain, [leg('call', atm, 1)]);
    expect(call).toMatchObject({ breakevens: [atm + c], maxProfit: null, maxLoss: -c, flat: false });
    const straddle = payoffStats(chain, [leg('call', atm, 1), leg('put', atm, 1)]);
    expect(straddle.breakevens).toEqual([atm - c - p, atm + c + p]);
    expect(straddle.maxLoss).toBe(-(c + p));
    const shortPut = payoffStats(chain, [leg('put', atm, -1)]);
    expect(shortPut).toMatchObject({ maxProfit: p, lossAtZero: true });
    const conversion = payoffStats(chain, [leg('fut', 0, 1), leg('put', atm, 1), leg('call', atm, -1)]);
    expect(conversion.flat).toBe(true);
    expect(payoffAt(chain, [leg('fut', 0, 1), leg('put', atm, 1), leg('call', atm, -1)], 30_000)).toBe(0);
  });

  it('accepts any build with the same payoff', () => {
    const atm = chain.strikes[2];
    const longFuture = makeTarget(chain, 1, 'long-future', seededRng(1));
    expect(solves(chain, longFuture, [leg('call', atm, 1), leg('put', atm, -1)])).toBe(true);
    // The synthetic target bans the future, so the plain future doesn't count there.
    const synthetic = makeTarget(chain, 2, 'synthetic-long', seededRng(1));
    expect(solves(chain, synthetic, [leg('fut', 0, 1)])).toBe(false);
    expect(solves(chain, synthetic, [leg('call', atm, 1), leg('put', atm, -1)])).toBe(true);
  });

  it('keeps a held future in place, so an empty book never matches the flat conversion', () => {
    const conv = makeTarget(chain, 3, 'conversion', seededRng(1));
    expect(solves(chain, conv, [])).toBe(false);
    expect(keepsHolds(conv, emptyLegs(chain, conv))).toBe(true);
    expect(solves(chain, conv, emptyLegs(chain, conv))).toBe(false);
    // Any strike works for a conversion, because parity holds at every strike.
    for (const k of chain.strikes) expect(solves(chain, conv, [leg('fut', 0, 1), leg('put', k, 1), leg('call', k, -1)]), String(k)).toBe(true);
  });

  it('builds rounds of six solvable targets, two per level', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const round = newPayoffRound(seededRng(seed));
      expect(round.targets.map((t) => t.level)).toEqual([1, 1, 2, 2, 3, 3]);
      for (const t of round.targets) {
        seen.add(t.id);
        expect(allowed(t, t.legs), t.id).toBe(true);
        expect(solves(round.chain, t, t.legs), t.id).toBe(true);
        expect(solves(round.chain, t, emptyLegs(round.chain, t)), `${t.id} is not solved by doing nothing`).toBe(false);
      }
    }
    expect([...seen].sort()).toEqual([...TARGET_IDS].sort());
  });

  it('is not solved by random clicking', () => {
    const solvedByChance = rate(2000, (seed) => {
      const rng = seededRng(seed);
      const round = newPayoffRound(rng);
      const t = round.targets[2 + Math.floor(rng() * 4)];
      const legs = emptyLegs(round.chain, t).map((l) => (rng() < 0.25 ? { ...l, qty: Math.floor(rng() * 5) - 2 } : l));
      return solves(round.chain, t, legs);
    });
    expect(solvedByChance).toBeLessThan(0.01);
    expect(PAYOFF.passSolved).toBe(5);
  });
});

describe('greeks pnl', () => {
  it('adds delta, half gamma times the move squared, vega and theta', () => {
    const parts = pnlParts({ label: 'x', delta: 1500, gamma: -20, vega: -50_000, theta: 1_00_000 }, { spot: 200, vol: 1, days: 1 });
    expect(parts).toEqual({ delta: 3_00_000, gamma: -4_00_000, vega: -50_000, theta: 1_00_000 });
    expect(sumParts(parts)).toBe(-50_000);
    expect(rupees(-50_000)).toBe('−₹50,000');
    expect(rupees(2_25_000)).toBe('+₹2.25 lakh');
  });

  it('builds eight books, harder as they go, each with four clearly different options', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const items = newGreeksRound(seededRng(seed));
      expect(items.map((i) => i.level)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
      for (const it of items) {
        expect(it.options[it.answer]).toBe(it.total);
        expect(new Set(it.options).size).toBe(4);
        const sorted = [...it.options].sort((a, b) => a - b);
        for (let i = 1; i < 4; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(9_000);
        if (it.level === 1) expect([it.parts.theta, it.parts.vega]).toEqual([0, 0]);
        if (it.level === 2) expect(it.parts.vega).toBe(0);
        if (it.level === 4) expect(it.move.days).toBe(3);
      }
    }
  });

  /** Pass rate of a player who works out a total their own way and picks the nearest option. */
  const passRate = (think: (it: ReturnType<typeof newGreeksRound>[number]) => number) =>
    rate(2000, (seed) => {
      const items = newGreeksRound(seededRng(seed));
      const right = items.filter((it) => {
        const t = think(it);
        const pick = it.options.reduce((best, o, i) => (Math.abs(o - t) < Math.abs(it.options[best] - t) ? i : best), 0);
        return pick === it.answer;
      }).length;
      return right >= GREEKS.passRight;
    });

  it('passes a player who does the sum and fails one who forgets gamma or guesses', () => {
    expect(passRate((it) => it.total)).toBe(1);
    expect(passRate((it) => it.total - it.parts.gamma)).toBeLessThan(0.05);
    expect(passRate((it) => it.total - 2 * it.parts.gamma)).toBeLessThan(0.05);
    const rng = seededRng(99);
    expect(passRate((it) => it.options[Math.floor(rng() * 4)])).toBeLessThan(0.02);
  });
});

describe('kelly betting', () => {
  it('uses coins whose Kelly fraction is on the chips, with exactly one coin without an edge', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const g = newKellyGame(seededRng(seed));
      const ks = g.coins.map(kellyFraction);
      expect(ks.filter((k) => k === 0).length).toBe(1);
      for (const k of ks) expect(KELLY.chips.map((c) => c / 100)).toContainEqual(expect.closeTo(k, 9));
      expect(g.flips.every((f) => f.length === KELLY.flipsPerCoin)).toBe(true);
    }
    expect(kellyFraction({ p: 0.6, b: 1 })).toBeCloseTo(0.2);
    expect(kellyFraction({ p: 0.4, b: 2 })).toBeCloseTo(0.1);
    expect(kellyFraction({ p: 0.55, b: 0.8 })).toBe(0);
  });

  it('settles a flip on the stake and the odds', () => {
    expect(settle(1_00_000, 0.2, { p: 0.5, b: 2 }, true)).toBe(1_40_000);
    expect(settle(1_00_000, 0.2, { p: 0.5, b: 2 }, false)).toBe(80_000);
    expect(settle(1_00_000, 0, { p: 0.5, b: 2 }, false)).toBe(1_00_000);
    expect(judge({ p: 0.6, b: 1 }, 0.2)).toBe('sized');
    expect(judge({ p: 0.6, b: 1 }, 0.5)).toBe('over');
    expect(judge({ p: 0.5, b: 1 }, 0)).toBe('out');
    expect(judge({ p: 0.5, b: 1 }, 0.05)).toBe('in');
  });

  const play = (seed: number, size: (k: number, rng: Rng) => number) => {
    const rng = seededRng(seed);
    const g = newKellyGame(rng);
    const bets = g.coins.map((c) => Array.from({ length: KELLY.flipsPerCoin }, () => size(kellyFraction(c), rng)));
    return scoreKelly(g, bets);
  };

  it('passes Kelly sizing every time, whatever the flips do, and fails sloppy sizing', () => {
    expect(rate(2000, (s) => play(s, (k) => k).passed)).toBe(1);
    // Always 10%: bets into the coin with no edge.
    expect(rate(2000, (s) => play(s, () => 0.1).passed)).toBe(0);
    // Two and a half times Kelly: overbets.
    expect(rate(2000, (s) => play(s, (k) => Math.min(1, 2.5 * k)).passed)).toBe(0);
    // Random chips.
    expect(rate(2000, (s) => play(s, (_, rng) => KELLY.chips[Math.floor(rng() * KELLY.chips.length)] / 100).passed)).toBeLessThan(0.01);
  });

  it('shows Kelly beating double Kelly over many games', () => {
    let kelly = 0;
    let double = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      const g = newKellyGame(seededRng(seed));
      kelly += Math.log(Math.max(pathAt(g, 1), 1));
      double += Math.log(Math.max(pathAt(g, 2), 1));
    }
    expect(kelly).toBeGreaterThan(double);
  });
});

describe('guess the number', () => {
  it('scores the statistic of the data drawn', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const items = newGuessRound(seededRng(seed));
      expect(items.filter((i) => i.kind === 'corr').length).toBe(4);
      expect(items.filter((i) => i.kind === 'vol').length).toBe(4);
      expect(items.filter((i) => i.kind === 'tails').length).toBe(2);
      for (const it of items) {
        if (it.kind === 'corr') {
          expect(it.answer).toBeCloseTo(correlation(it.xs, it.ys), 2);
          expect(Math.abs(it.answer)).toBeLessThanOrEqual(1);
        }
        if (it.kind === 'vol') {
          expect(it.answer).toBe(Math.round(annualVol(it.returns)));
          expect(it.closes.length).toBe(GUESS.days + 1);
        }
        if (it.kind === 'tails') {
          const fat = it.series[it.answer];
          const thin = it.series[1 - it.answer];
          expect(stdev(fat)).toBeCloseTo(stdev(thin), 9);
          expect(excessKurtosis(fat)).toBeGreaterThan(excessKurtosis(thin) + 1);
        }
      }
    }
  });

  it('counts a guess within the tolerance', () => {
    const corr: GuessItem = { kind: 'corr', xs: [], ys: [], answer: 0.6 };
    expect(isHit(corr, 0.75)).toBe(true);
    expect(isHit(corr, 0.8)).toBe(false);
    const vol: GuessItem = { kind: 'vol', closes: [], returns: [], answer: 20 };
    expect(isHit(vol, 25)).toBe(true);
    expect(isHit(vol, 26)).toBe(false);
  });

  const passRate = (guess: (it: GuessItem, rng: Rng) => number) =>
    rate(2000, (seed) => {
      const rng = seededRng(seed);
      const items = newGuessRound(rng);
      return items.filter((it) => isHit(it, guess(it, rng))).length >= GUESS.passHits;
    });

  it('passes a good eye, and fails a guesser', () => {
    const skilled = (it: GuessItem, rng: Rng) =>
      it.kind === 'corr' ? Math.max(-1, Math.min(1, it.answer + 0.07 * normal(rng))) : it.kind === 'vol' ? it.answer * (1 + 0.1 * normal(rng)) : rng() < 0.9 ? it.answer : 1 - it.answer;
    expect(passRate(skilled)).toBeGreaterThan(0.8);
    const random = (it: GuessItem, rng: Rng) => (it.kind === 'corr' ? -1 + 2 * rng() : it.kind === 'vol' ? 2 + 78 * rng() : rng() < 0.5 ? 0 : 1);
    expect(passRate(random)).toBeLessThan(0.02);
  });
});

describe('fermi estimates', () => {
  it('has answers the dial can reach within a factor of 1.5', () => {
    for (const f of fermiItems) {
      const nearest = Math.min(...DIAL.map((v) => ordersOff(v, f.answer)));
      expect(nearest, f.id).toBeLessThan(Math.log10(1.5));
    }
    expect(newFermiRound(seededRng(3)).length).toBe(FERMI.items);
  });

  it('counts within 3 times either way as a hit', () => {
    expect(fermiHit(3_000, 1_000)).toBe(true);
    expect(fermiHit(334, 1_000)).toBe(true);
    expect(fermiHit(3_200, 1_000)).toBe(false);
    expect(ordersOff(1e6, 1e3)).toBeCloseTo(3);
  });

  it('writes big numbers the Indian way and the international way', () => {
    expect(bigNumber(30_000_000)).toBe('3 crore (30 million)');
    expect(bigNumber(2_500_000)).toBe('25 lakh (2.5 million)');
    expect(bigNumber(1e12)).toBe('1 lakh crore (1 trillion)');
    expect(bigNumber(7_500)).toBe('7,500');
  });

  it('passes a decent estimator and fails a wild one', () => {
    const passRate = (sd: number) =>
      rate(2000, (seed) => {
        const rng = seededRng(seed);
        const items = newFermiRound(rng);
        return items.filter((f) => fermiHit(f.answer * 10 ** (sd * normal(rng)), f.answer)).length >= FERMI.passHits;
      });
    expect(passRate(0.25)).toBeGreaterThan(0.9);
    expect(passRate(1.5)).toBeLessThan(0.05);
  });
});
