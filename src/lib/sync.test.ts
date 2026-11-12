import { describe, expect, it } from 'vitest';
import { newProgress } from './scheduler';
import { mergeProgress, sameProgress } from './sync';
import type { Progress, TermState } from './types';

const t = (seen: number, due: string): TermState => ({ step: seen, due, seen, correct: seen, wrong: 0, lapses: 0, trouble: false, introduced: '2026-11-01' });

const phone: Progress = {
  ...newProgress(),
  xp: 120,
  streak: 4,
  lastActiveDay: '2026-11-10',
  terms: { delta: t(5, '2026-11-14'), gamma: t(1, '2026-11-11') },
  days: { '2026-11-10': { xp: 40, newTerms: 5, reviews: 10, lessons: 2 } },
  unlocked: ['options'],
  drills: { k1: { rounds: 3, passed: true, bestRight: 9, bestMs: 50_000, last: '2026-11-10' } },
  mocks: { Coding: { best: 6, total: 8, date: '2026-11-09', tries: 2 } },
  tests: { options: { date: '2026-11-08', right: 7, total: 10, passed: false } },
};
const laptop: Progress = {
  ...newProgress(),
  xp: 90,
  streak: 6,
  lastActiveDay: '2026-11-11',
  settings: { ...newProgress().settings, newPerDay: 20 },
  terms: { delta: t(3, '2026-11-12'), vega: t(2, '2026-11-13') },
  days: { '2026-11-10': { xp: 10, newTerms: 8, reviews: 2, lessons: 1 }, '2026-11-11': { xp: 30, newTerms: 3, reviews: 5, lessons: 1 } },
  unlocked: ['quant'],
  drills: { k1: { rounds: 5, passed: false, bestRight: 7, bestMs: 40_000, last: '2026-11-11' }, k2: { rounds: 1, passed: false, bestRight: 3, last: '2026-11-11' } },
  mocks: { Coding: { best: 5, total: 8, date: '2026-11-11', tries: 3 } },
  tests: { options: { date: '2026-11-11', right: 9, total: 10, passed: true } },
  phase3Key: true,
};

describe('progress sync: merging two devices', () => {
  it('keeps the further-along copy of everything', () => {
    const m = mergeProgress(phone, laptop);
    expect(m.xp).toBe(120);
    expect(m.terms.delta.seen).toBe(5);
    expect(Object.keys(m.terms).sort()).toEqual(['delta', 'gamma', 'vega']);
    expect(m.days['2026-11-10']).toEqual({ xp: 40, newTerms: 8, reviews: 10, lessons: 2 });
    expect(m.days['2026-11-11'].xp).toBe(30);
    expect(m.unlocked).toEqual(['options', 'quant']);
    expect(m.drills!.k1).toEqual({ rounds: 5, passed: true, bestRight: 9, bestMs: 40_000, last: '2026-11-11' });
    expect(m.drills!.k2.rounds).toBe(1);
    expect(m.mocks!.Coding).toEqual({ best: 6, total: 8, date: '2026-11-09', tries: 3 });
    expect(m.tests!.options.passed).toBe(true);
    expect(m.phase3Key).toBe(true);
    // The streak comes from the device used last; settings from the second copy.
    expect(m.streak).toBe(6);
    expect(m.lastActiveDay).toBe('2026-11-11');
    expect(m.settings.newPerDay).toBe(20);
  });

  it('gives the same progress whichever device syncs first, apart from settings', () => {
    const ab = mergeProgress(phone, laptop);
    const ba = mergeProgress(laptop, phone);
    expect(sameProgress({ ...ab, settings: ba.settings }, ba)).toBe(true);
  });

  it('changes nothing when merged with itself or merged twice', () => {
    expect(sameProgress(mergeProgress(phone, phone), phone)).toBe(true);
    const m = mergeProgress(phone, laptop);
    expect(sameProgress(mergeProgress(m, laptop), m)).toBe(true);
    expect(sameProgress(mergeProgress(m, phone), { ...m, settings: phone.settings })).toBe(true);
  });

  it('lets a reset or restored backup win over older progress from any device', () => {
    const reset: Progress = { ...newProgress(), epoch: 1_700_000_000_000 };
    expect(mergeProgress(phone, reset)).toBe(reset);
    expect(mergeProgress(reset, laptop)).toBe(reset);
    const later = { ...laptop, epoch: 1_800_000_000_000 };
    expect(mergeProgress(reset, later)).toBe(later);
  });
});
