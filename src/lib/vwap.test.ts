import { describe, expect, it } from 'vitest';
import { path } from './content';
import { gameOf } from './games';
import { seededRng } from './questions';
import { forecastFrom, isDone, newVwapDay, paceRate, playSlice, scoreVwap, SLICES, startState, VWAP, vwapUpTo, type VwapDay, type VwapState } from './vwap';

type Rule = (state: VwapState, day: VwapDay) => number;

function play(seed: number, rule: Rule) {
  const day = newVwapDay(seededRng(seed));
  let state = startState();
  while (!isDone(state)) state = playSlice(day, state, rule(state, day));
  return scoreVwap(day, state);
}

function passRate(rule: Rule, n = 2000) {
  let passed = 0;
  for (let seed = 1; seed <= n; seed++) if (play(seed, rule).passed) passed++;
  return passed / n;
}

describe('beat VWAP: the day', () => {
  it('has a U-shaped profile that adds up to the day, and one surprise slice', () => {
    expect(VWAP.profile.reduce((a, b) => a + b, 0)).toBe(100);
    expect(VWAP.times).toHaveLength(SLICES + 1);
    expect(forecastFrom(0)).toBe(VWAP.forecast);
    for (let seed = 1; seed <= 200; seed++) {
      const d = newVwapDay(seededRng(seed));
      expect(d.event.slice).toBeGreaterThanOrEqual(2);
      expect(d.event.slice).toBeLessThanOrEqual(7);
      expect(d.volumes).toHaveLength(SLICES);
      expect(d.volumes.every((v) => v > 0)).toBe(true);
    }
  });

  it('fills a share of the volume, pays more the faster it trades, and counts its own prints in VWAP', () => {
    const day: VwapDay = { volumes: Array(SLICES).fill(500_000), prices: Array(SLICES).fill(1500), factor: 1, event: { slice: 3, kind: 'lull' } };
    const slow = playSlice(day, startState(), 5);
    const fast = playSlice(day, startState(), 20);
    expect(slow.filled).toBe(25_000);
    expect(fast.filled).toBe(100_000);
    expect(fast.slices[0].price).toBeGreaterThan(slow.slices[0].price);
    // 20% of the volume costs 0.4 bps per 1%: 8 bps over the market.
    expect(fast.slices[0].price).toBeCloseTo(1500 * 1.0008, 6);
    // The next slice starts higher: permanent impact.
    const after = playSlice(day, fast, 0);
    expect(after.slices[1].market).toBeGreaterThan(1500);
    expect(vwapUpTo(day, fast, 1)).toBeGreaterThan(1500);
  });

  it('never buys more than the order', () => {
    const day = newVwapDay(seededRng(3));
    let s = startState();
    while (!isDone(s)) s = playSlice(day, s, 25);
    expect(s.filled).toBe(VWAP.order);
  });
});

describe('beat VWAP: balance', () => {
  it('passes the pace rule most days', () => {
    expect(passRate((s) => paceRate(s))).toBeGreaterThan(0.85);
  });

  it('fails front-loading at 25%, and a slow 5% that leaves too much for the last slice', () => {
    expect(passRate(() => 25)).toBe(0);
    expect(passRate(() => 5)).toBe(0);
  });

  it('passes a fixed rate less often than pacing', () => {
    const pace = passRate((s) => paceRate(s));
    for (const r of [10, 15, 20]) expect(passRate(() => r)).toBeLessThan(pace - 0.2);
  });

  it('finishes the order in the last slice, and counts what that took against the cap', () => {
    const day: VwapDay = { volumes: Array(SLICES).fill(500_000), prices: Array(SLICES).fill(1500), factor: 1, event: { slice: 3, kind: 'lull' } };
    let s = startState();
    while (!isDone(s)) s = playSlice(day, s, 5);
    expect(s.filled).toBe(VWAP.order);
    expect(s.slices[SLICES - 1].rate).toBeGreaterThan(VWAP.maxRate);
    expect(scoreVwap(day, s).checks.capped).toBe(false);
  });

  it('sits before the morning meeting on the execution track', () => {
    const order = path.map((r) => r.unit.id);
    expect(gameOf('x8')).toBe('vwap');
    expect(order.indexOf('x8')).toBeGreaterThan(order.indexOf('x4'));
    expect(order.indexOf('x8')).toBeLessThan(order.indexOf('x7'));
  });
});
