import { describe, expect, it } from 'vitest';
import careerData from '../data/careers.json';
import { checkAnswer } from './drills';
import { categories } from './content';
import { isRight, mockByRound, mockReady, MOCKS, newMock, recordMock, type MockQuestion, type Sum } from './mock';
import { seededRng } from './questions';
import type { Progress } from './types';

const base = {} as Progress;
// Sums as the server deals them; here the token carries the answer, so a test can mark them.
const sums: Sum[] = categories.flatMap((c) => c.terms.flatMap((t) => (t.calcs ?? []).map((k) => ({ termId: t.id, prompt: k.q, options: k.options, token: String(k.answer) }))));
const marked = (q: MockQuestion): MockQuestion => (q.kind === 'choice' ? { ...q, answer: Number(q.sum.token), why: 'worked' } : q);

describe('mock rounds', () => {
  it('mocks only rounds that are on the career map', () => {
    const names = new Set((careerData as { rounds: { name: string }[] }).rounds.map((r) => r.name));
    for (const m of MOCKS) expect(names.has(m.round)).toBe(true);
  });

  it('fills every round to its count with no question twice', () => {
    for (const spec of MOCKS)
      for (let s = 1; s <= 40; s++) {
        const qs = newMock(spec, seededRng(s), sums);
        expect(qs).toHaveLength(spec.count);
        expect(new Set(qs.map((q) => q.prompt)).size).toBe(spec.count);
        // Dealt without answers: those come when the round is marked.
        for (const q of qs) if (q.kind === 'choice') expect(q.answer).toBeUndefined();
      }
  });

  it('marks typed and chosen answers, and a skip as wrong', () => {
    for (const spec of MOCKS) {
      for (const dealt of newMock(spec, seededRng(7), sums)) {
        const q = marked(dealt);
        expect(isRight(q, null)).toBe(false);
        if (q.kind === 'choice') {
          expect(isRight(dealt, q.answer!)).toBe(false);
          expect(isRight(q, q.answer!)).toBe(true);
          expect(isRight(q, (q.answer! + 1) % q.options.length)).toBe(false);
        } else {
          expect(checkAnswer(q.drill, String(q.drill.answer))).toBe('right');
          expect(isRight(q, String(q.drill.answer))).toBe(true);
          expect(isRight(q, String(q.drill.answer + 1000))).toBe(false);
        }
      }
    }
  });

  it('keeps the best score and counts every try', () => {
    let p = recordMock(base, 'Coding', 5, 8, '2026-11-01');
    p = recordMock(p, 'Coding', 3, 8, '2026-11-02');
    expect(p.mocks!.Coding).toEqual({ best: 5, total: 8, date: '2026-11-01', tries: 2 });
    p = recordMock(p, 'Coding', 7, 8, '2026-11-03');
    expect(p.mocks!.Coding).toEqual({ best: 7, total: 8, date: '2026-11-03', tries: 3 });
    expect(mockReady(7, 8)).toBe(true);
    expect(mockReady(6, 8)).toBe(false);
    expect(mockByRound.get('Mental maths')!.minutes).toBe(5);
  });
});
