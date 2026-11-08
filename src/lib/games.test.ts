import { describe, expect, it } from 'vitest';
import { categories, path, unitById } from './content';
import { DIAL, FERMI, fermiHit, fermiItems, newFermiRound, ordersOff, bigNumber } from './fermi';
import { BACKTEST, BACKTEST_POINTS, backtestPassed, FLAW_IDS, FLAWS, newBacktestRound, SLOT_ORDER, STRATEGIES } from './backtest';
import { GAMES, gameOf } from './games';
import { GREEKS, newGreeksRound, pnlParts, rupees, sumParts } from './greeks';
import { annualVol, correlation, excessKurtosis, GUESS, isHit, newGuessRound, normal, stdev, type GuessItem } from './guess';
import { clips, MEETING, MEETING_QUESTIONS, meetingPassed, newMeetingRound, SETTINGS } from './meeting';
import { judge, KELLY, kellyFraction, newKellyGame, pathAt, scoreKelly, settle } from './kelly';
import { brokenAt, callDay, heldPath, newPairsGame, PAIR_DAYS, pairPnl, PAIRS, ruleCalls, rulePath, scorePairs, type Pair, type Pos } from './pairs';
import { allowed, emptyLegs, keepsHolds, makeChain, makeTarget, newPayoffRound, PAYOFF, payoffAt, payoffStats, solves, TARGET_IDS, type Leg } from './payoff';
import { finishGame, passRule, recordLine, roundSize } from './practice';
import { seededRng, type Rng } from './questions';
import { carefulChoice, expectedMax, gridRight, isGood, LUCK_TABLE, newSignalRound, patchMeans, SIGNAL, signalPassed, type GridChoice, type GridItem, type SignalItem } from './signal';
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

  it('explains each game in its own words', () => {
    const hows = Object.values(GAMES).map((g) => g.how);
    expect(new Set(hows).size).toBe(hows.length);
  });

  it('describes each game for the unit sheet and the path', () => {
    for (const u of gameUnits) {
      expect(roundSize(u.id), u.id).toMatch(/^\d+ \w+/);
      expect(passRule(u.id), u.id).toMatch(/^pass /);
      expect(recordLine(newProgress(), u.id), u.id).not.toBe('');
      expect(GAMES[u.game!].how, u.id).not.toBe('');
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
    // The research games follow the units whose words they use.
    before('q5', 'q13');
    before('q9', 'q13');
    before('q7', 'q14');
    before('q10', 'q14');
    before('z3', 'z7');
    before('z7', 'z4');
    // The meeting game comes last before phase 3, once every phrase unit is behind it.
    before('x6', 'x7');
    before('d6', 'x7');
    const main = path.filter((r) => r.pass !== 3);
    expect(main[main.length - 1].unit.id).toBe('x7');
    expect(path.find((r) => r.unit.id === 'z6')?.pass).toBe(3);
    expect(path.find((r) => r.unit.id === 'z7')?.pass).toBe(3);
    expect(path.find((r) => r.unit.id === 'q14')?.pass).not.toBe(3);
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

describe('morning meeting', () => {
  it('deals five clips from five different settings, two questions each', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const round = newMeetingRound(seededRng(seed));
      expect(round.length).toBe(MEETING.clips);
      expect(new Set(round.map((r) => r.clip.setting)).size).toBe(MEETING.clips);
      expect(round.flatMap((r) => r.questions).length).toBe(MEETING_QUESTIONS);
    }
  });

  it('keeps the right answer pointing at the option written first', () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (const { clip, questions } of newMeetingRound(seededRng(seed))) {
        questions.forEach((q, i) => {
          expect(q.options[q.answer]).toBe(clip.questions[i].options[0]);
          expect([...q.options].sort()).toEqual([...clip.questions[i].options].sort());
        });
      }
    }
  });

  it('moves the right answer around, so its place gives nothing away', () => {
    const places = [0, 0, 0, 0];
    for (let seed = 1; seed <= 500; seed++) for (const r of newMeetingRound(seededRng(seed))) for (const q of r.questions) places[q.answer]++;
    const total = places.reduce((a, b) => a + b, 0);
    for (const n of places) expect(n / total).toBeGreaterThan(0.2);
  });

  it('uses every clip and every setting', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 2000; seed++) for (const r of newMeetingRound(seededRng(seed))) seen.add(r.clip.id);
    expect(seen.size).toBe(clips.length);
    for (const s of Object.keys(SETTINGS)) expect(clips.some((c) => c.setting === s), s).toBe(true);
  });

  it('passes someone who follows the talk and fails a guesser', () => {
    const passRate = (p: number) =>
      rate(2000, (seed) => {
        const rng = seededRng(seed);
        let right = 0;
        for (let i = 0; i < MEETING_QUESTIONS; i++) if (rng() < p) right++;
        return meetingPassed(right);
      });
    expect(passRate(0.95)).toBeGreaterThan(0.95);
    expect(passRate(0.25)).toBeLessThan(0.001);
  });
});

describe('backtest detective', () => {
  it('deals six reports with six different flaws from six different strategies', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const round = newBacktestRound(seededRng(seed));
      expect(round.length).toBe(BACKTEST.cases);
      expect(new Set(round.map((c) => c.flaw)).size).toBe(BACKTEST.cases);
      expect(new Set(round.map((c) => c.strategy.id)).size).toBe(BACKTEST.cases);
      for (const c of round) {
        // Exactly one line differs from the strategy's clean write-up, and it is the answer.
        const changed = c.lines.map((l, i) => (l.text !== c.strategy.lines[l.slot] ? i : -1)).filter((i) => i >= 0);
        expect(changed).toEqual([c.answer]);
        expect(c.lines.map((l) => l.slot)).toEqual(SLOT_ORDER);
        expect((FLAWS[c.flaw].slots as readonly string[]).includes(c.lines[c.answer].slot)).toBe(true);
        expect(new Set(c.names).size).toBe(4);
        expect(c.names).toContain(c.flaw);
        // Overfitting and data snooping overlap, so one is never a wrong name for the other.
        if (c.flaw === 'overfit') expect(c.names).not.toContain('snooping');
        if (c.flaw === 'snooping') expect(c.names).not.toContain('overfit');
      }
    }
  });

  it('uses every report, and moves the right name around', () => {
    const seen = new Set<string>();
    const places = [0, 0, 0, 0];
    for (let seed = 1; seed <= 2000; seed++)
      for (const c of newBacktestRound(seededRng(seed))) {
        seen.add(`${c.strategy.id}/${c.flaw}`);
        places[c.names.indexOf(c.flaw)]++;
      }
    expect(seen.size).toBe(STRATEGIES.reduce((n, s) => n + s.cases.length, 0));
    const total = places.reduce((a, b) => a + b, 0);
    for (const n of places) expect(n / total).toBeGreaterThan(0.2);
    for (const f of FLAW_IDS) expect(STRATEGIES.filter((s) => s.cases.some((c) => c.flaw === f)).length, f).toBeGreaterThanOrEqual(3);
  });

  it('passes a careful reader and fails a guesser', () => {
    const passRate = (find: number, name: number) =>
      rate(2000, (seed) => {
        const rng = seededRng(seed);
        let points = 0;
        for (let i = 0; i < BACKTEST.cases; i++) points += (rng() < find ? 1 : 0) + (rng() < name ? 1 : 0);
        return backtestPassed(points);
      });
    expect(passRate(0.92, 0.95)).toBeGreaterThan(0.9);
    // Tapping one of six lines and one of four names at random.
    expect(passRate(1 / 6, 1 / 4)).toBeLessThan(0.001);
    expect(BACKTEST_POINTS).toBe(12);
  });
});

describe('signal lab', () => {
  it('knows how high luck reaches', () => {
    expect(expectedMax(10)).toBeCloseTo(1.539, 2);
    expect(expectedMax(100)).toBeCloseTo(2.508, 2);
    expect(expectedMax(1000)).toBeCloseTo(3.241, 2);
    // The rounded figures the rules teach stay close to the exact ones.
    for (const [n, v] of Object.entries(LUCK_TABLE)) expect(Math.abs(expectedMax(Number(n)) - v), n).toBeLessThan(0.06);
  });

  const rounds = Array.from({ length: 400 }, (_, i) => newSignalRound(seededRng(i + 1)));
  const grids = rounds.flat().filter((it): it is GridItem => it.kind === 'grid');

  it('deals five grids of every kind, two luck questions and one on decay, starting with a grid', () => {
    for (const r of rounds) {
      expect(r.length).toBe(SIGNAL.items);
      expect(r[0].kind).toBe('grid');
      const types = r.filter((it): it is GridItem => it.kind === 'grid').map((g) => g.type);
      expect(types.length).toBe(SIGNAL.grids);
      expect(new Set(types)).toEqual(new Set(['noise', 'plateau', 'spike']));
      expect(types.filter((t) => t === 'noise').length).toBeLessThanOrEqual(2);
      expect(types.filter((t) => t === 'plateau').length).toBeLessThanOrEqual(2);
      expect(r.filter((it) => it.kind === 'luck').length).toBe(2);
      expect(r.filter((it) => it.kind === 'decay').length).toBe(1);
    }
  });

  it('draws grids a careful researcher can always get right', () => {
    for (const g of grids) {
      const best = Math.max(...g.inSample.flat());
      if (g.type === 'noise') {
        expect(best).toBeLessThanOrEqual(g.luck - 0.1 + 1e-9);
        expect(g.truth.flat().every((t) => t === 0)).toBe(true);
      } else {
        expect(best).toBeGreaterThanOrEqual(g.luck + 0.3 - 1e-9);
      }
      expect(gridRight(g, carefulChoice(g)), `${g.type} ${g.name}`).toBe(true);
      // The top in-sample cell is a fair pick on a plateau and the trap on a spike.
      const flat = g.inSample.flat();
      const k = flat.indexOf(best);
      const top = { row: Math.floor(k / 5), col: k % 5 };
      if (g.type === 'plateau') expect(isGood(g, top.row, top.col)).toBe(true);
      if (g.type === 'spike') expect(isGood(g, top.row, top.col)).toBe(false);
    }
    expect(patchMeans([[1, 0], [0, 0]])[1][1]).toBeCloseTo(0.25);
  });

  it('asks luck and decay questions with one right answer', () => {
    for (const it of rounds.flat()) {
      if (it.kind === 'luck') {
        expect(it.options[it.answer]).toBeCloseTo(Math.round((LUCK_TABLE[it.tries] / Math.sqrt(it.years)) * 10) / 10, 9);
        expect(new Set(it.options).size).toBe(4);
        for (let i = 1; i < 4; i++) expect(it.options[i]).toBeGreaterThan(it.options[i - 1]);
      }
      if (it.kind === 'decay') {
        expect(it.options[it.answer]).toBe(it.halfLife);
        expect(it.ic[it.halfLife]).toBeCloseTo(it.ic[0] / 2, 9);
      }
    }
  });

  const play = (grid: (g: GridItem, rng: Rng) => GridChoice, quiz: number) =>
    rate(2000, (seed) => {
      const rng = seededRng(seed);
      const items: SignalItem[] = newSignalRound(rng);
      const right = items.filter((it) => (it.kind === 'grid' ? gridRight(it, grid(it, rng)) : rng() < quiz)).length;
      return signalPassed(right);
    });

  it('passes a careful researcher and fails the shortcuts', () => {
    expect(play((g) => carefulChoice(g), 0.9)).toBeGreaterThan(0.95);
    // Always taking the best in-sample cell, or always binning, can't pass even with every quiz right.
    const topCell = (g: GridItem): GridChoice => {
      const flat = g.inSample.flat();
      const k = flat.indexOf(Math.max(...flat));
      return { row: Math.floor(k / 5), col: k % 5 };
    };
    expect(play(topCell, 1)).toBe(0);
    expect(play(() => 'bin', 1)).toBe(0);
    const random = (_: GridItem, rng: Rng): GridChoice => (rng() < 0.5 ? 'bin' : { row: Math.floor(rng() * 5), col: Math.floor(rng() * 5) });
    expect(play(random, 0.25)).toBeLessThan(0.02);
  });
});

describe('pairs trader', () => {
  const games = Array.from({ length: 500 }, (_, i) => newPairsGame(seededRng(i + 1)));

  it('reads the rules off the z-score on screen', () => {
    expect(ruleCalls(0, 2.3, false)).toEqual([-1]);
    expect(ruleCalls(0, -2.1, false)).toEqual([1]);
    expect(ruleCalls(0, 1.7, false)).toEqual([0, -1]);
    expect(ruleCalls(0, 0.9, false)).toEqual([0]);
    expect(ruleCalls(-1, 0.3, false)).toEqual([0]);
    expect(ruleCalls(-1, 0.8, false)).toEqual([-1, 0]);
    expect(ruleCalls(-1, 3.9, false)).toEqual([-1]);
    expect(ruleCalls(-1, 4.0, false)).toEqual([0]);
    // 3.96 shows as +4.0, so it counts as the stop.
    expect(ruleCalls(-1, 3.96, false)).toEqual([0]);
    expect(ruleCalls(-1, -2.2, false)).toEqual([1]);
    expect(ruleCalls(1, 1.2, true)).toEqual([0]);
  });

  it('deals three pairs, one of which breaks, measured against the formation period', () => {
    for (const g of games) {
      expect(g.length).toBe(PAIRS.pairs);
      expect(g.filter((p) => p.breakDay !== null).length).toBe(1);
      for (const p of g) {
        expect(p.z.length).toBe(PAIR_DAYS + 1);
        const f = p.z.slice(0, PAIRS.formation);
        const m = f.reduce((a, b) => a + b, 0) / f.length;
        expect(Math.abs(m)).toBeLessThan(1e-9);
        if (p.breakDay === null) expect(Math.max(...p.z.map(Math.abs))).toBeLessThan(3.6);
      }
    }
  });

  it('springs the trap: the rules are in the losing trade when the broken pair hits its stop', () => {
    let rules = 0;
    let held = 0;
    for (const g of games) {
      const p = g.find((x) => x.breakDay !== null)!;
      const path = rulePath(p);
      const first = path.findIndex((_, w) => brokenAt(p, w));
      expect(first).toBeGreaterThanOrEqual(2);
      expect(path[first - 1]).not.toBe(0);
      expect(path.slice(first).every((x) => x === 0)).toBe(true);
      rules += pairPnl(p, path);
      held += pairPnl(p, heldPath(p));
    }
    // Holding on through the break costs far more than taking the stop.
    expect(held).toBeLessThan(2 * rules);
  });

  const follow = (g: Pair[], rng: Rng, slip: number, holdStops = false): Pos[][] =>
    g.map((p) => {
      const out: Pos[] = [];
      let prev: Pos = 0;
      for (let w = 0; w < PAIRS.weeks; w++) {
        const z = p.z[callDay(w)];
        let c: Pos = ruleCalls(prev, z, brokenAt(p, w - 1))[0];
        if (holdStops && prev !== 0 && c === 0 && brokenAt(p, w)) c = prev;
        if (rng() < slip) c = ([-1, 0, 1] as Pos[])[Math.floor(rng() * 3)];
        out.push(c);
        prev = c;
      }
      return out;
    });

  it('passes the rules every time, mostly passes small slips, and fails holding through the stop', () => {
    const passRate = (slip: number, holdStops = false) => {
      let k = 0;
      games.forEach((g, i) => {
        if (scorePairs(g, follow(g, seededRng(i + 7), slip, holdStops)).passed) k++;
      });
      return k / games.length;
    };
    expect(passRate(0)).toBe(1);
    expect(passRate(0.05)).toBeGreaterThan(0.7);
    expect(passRate(0, true)).toBe(0);
    expect(passRate(1)).toBeLessThan(0.01);
    // Entering the wrong way round is counted.
    const g = games[0];
    const wrong = follow(g, seededRng(1), 0).map((calls) => calls.map((c) => (c === 0 ? 0 : (-c as Pos))));
    expect(scorePairs(g, wrong).wrongWay).toBeGreaterThan(0);
    expect(scorePairs(g, wrong).passed).toBe(false);
  });
});
