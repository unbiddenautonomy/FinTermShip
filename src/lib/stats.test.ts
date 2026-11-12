import { describe, expect, it } from 'vitest';
import { categories } from './content';
import { newProgress } from './scheduler';
import { accuracy, areaStats, totals, weeklyStats } from './stats';
import type { Progress, TermState } from './types';

const ids = categories[0].terms.map((t) => t.id);
const state = (introduced: string, over: Partial<TermState> = {}): TermState => ({ step: 2, due: introduced, seen: 2, correct: 2, wrong: 1, lapses: 0, trouble: false, introduced, ...over });

describe('progress stats', () => {
  const p: Progress = {
    ...newProgress(),
    terms: { [ids[0]]: state('2026-01-01', { step: 5 }), [ids[1]]: state('2026-11-10'), [ids[2]]: state('2026-11-12', { step: 6, correct: 5, wrong: 0 }) },
    days: { '2026-11-10': { xp: 20, newTerms: 1, reviews: 0, lessons: 1 }, '2026-11-12': { xp: 15, newTerms: 1, reviews: 0, lessons: 1 } },
  };

  it('counts weeks ending today, with a running total that includes older terms', () => {
    const w = weeklyStats(p, '2026-11-12', 4);
    expect(w).toHaveLength(4);
    expect(w[3].start).toBe('2026-11-06');
    expect(w[3].added).toBe(2);
    expect(w[3].xp).toBe(35);
    expect(w[0].total).toBe(1);
    expect(w[3].total).toBe(3);
  });

  it('sums an area and the totals', () => {
    const a = areaStats(p).find((x) => x.id === categories[0].id)!;
    expect(a).toMatchObject({ met: 3, known: 2, right: 9, wrong: 2, total: ids.length });
    expect(totals(p)).toMatchObject({ met: 3, known: 2, mastered: 1, daysPractised: 2 });
    expect(accuracy(0, 0)).toBeNull();
    expect(accuracy(3, 1)).toBe(0.75);
  });
});
