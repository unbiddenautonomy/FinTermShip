import { describe, expect, it } from 'vitest';
import { categories } from './content';
import { seededRng } from './questions';
import { newProgress } from './scheduler';
import type { Progress, TermState } from './types';
import { buildWeakSpots, isWeak, weakSpots } from './weak';

const ids = categories.flatMap((c) => c.terms.map((t) => t.id));
const state = (over: Partial<TermState>): TermState => ({ step: 3, due: '2026-01-01', seen: 4, correct: 4, wrong: 0, lapses: 0, trouble: false, introduced: '2026-01-01', ...over });

function withTerms(entries: [string, Partial<TermState>][]): Progress {
  const p = newProgress();
  return { ...p, terms: Object.fromEntries(entries.map(([id, s]) => [id, state(s)])) };
}

describe('weak spots', () => {
  it('counts trouble, lapses and a high miss rate, and needs at least one miss', () => {
    expect(isWeak(state({ wrong: 0, trouble: true }))).toBe(false);
    expect(isWeak(state({ wrong: 1, trouble: true }))).toBe(true);
    expect(isWeak(state({ wrong: 1, lapses: 1, correct: 9 }))).toBe(true);
    expect(isWeak(state({ wrong: 1, correct: 9 }))).toBe(false);
    expect(isWeak(state({ wrong: 2, correct: 4 }))).toBe(true);
  });

  it('lists trouble terms first, then by how often they are missed', () => {
    const p = withTerms([
      [ids[0], { wrong: 2, correct: 6 }],
      [ids[1], { wrong: 3, correct: 1 }],
      [ids[2], { wrong: 1, correct: 9, trouble: true }],
      [ids[3], { wrong: 0, correct: 5 }],
    ]);
    expect(weakSpots(p)).toEqual([ids[2], ids[1], ids[0]]);
  });

  it('skips ids no longer in the content and caps the list', () => {
    const p = withTerms([['gone-term', { wrong: 5, correct: 0 }], ...ids.slice(0, 12).map((id) => [id, { wrong: 3, correct: 1 }] as [string, Partial<TermState>])]);
    const list = weakSpots(p);
    expect(list).not.toContain('gone-term');
    expect(list).toHaveLength(8);
  });

  it('builds a practice round on those terms only', () => {
    const p = withTerms(ids.slice(0, 5).map((id) => [id, { wrong: 3, correct: 1 }]));
    const plan = buildWeakSpots(p, seededRng(7))!;
    expect(plan.kind).toBe('practice');
    expect(plan.weak).toBe(true);
    const asked = new Set(plan.questions.flatMap((q) => (q.kind === 'match' ? q.termIds : 'termId' in q ? [q.termId] : [])));
    for (const id of asked) expect(ids.slice(0, 5)).toContain(id);
    expect(buildWeakSpots(withTerms([[ids[0], { wrong: 3 }]]), seededRng(1))).toBeNull();
  });
});
