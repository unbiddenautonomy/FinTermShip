import { describe, expect, it } from 'vitest';
import { categories, coreTermIds, path, pathTermIds, termById } from './content';
import { buildLesson } from './lesson';
import { calcQuestion, fillQuestion, meaningQuestion, promptFor, retryQuestion, reviewQuestion, seededRng, termQuestion, tfQuestion } from './questions';
import { graduate, introduce, newProgress } from './scheduler';
import type { Progress } from './types';

const today = '2026-11-04';

describe('learning path', () => {
  it('teaches every core unit of every category before any other unit', () => {
    const firstPass2 = path.findIndex((p) => p.pass === 2);
    expect(path.slice(0, firstPass2).every((p) => p.unit.core)).toBe(true);
    expect(path.slice(firstPass2).every((p) => !p.unit.core)).toBe(true);
    expect(path[0].category.id).toBe(categories[0].id);
    expect(coreTermIds.length).toBeGreaterThan(40);
    expect(new Set(pathTermIds).size).toBe(pathTermIds.length);
  });
});

describe('lessons', () => {
  it('starts with 4 new terms, each introduced before it is asked', () => {
    const plan = buildLesson(newProgress(), today, seededRng(1))!;
    expect(plan.kind).toBe('new');
    expect(plan.newIds).toEqual(pathTermIds.slice(0, 4));
    const introduced = new Set<string>();
    for (const q of plan.questions) {
      if (q.kind === 'intro') introduced.add(q.termId);
      else if (q.kind === 'match') q.termIds.forEach((id) => expect(introduced.has(id)).toBe(true));
      else expect(introduced.has(q.termId)).toBe(true);
    }
    const kinds = new Set(plan.questions.map((q) => q.kind));
    for (const k of ['intro', 'meaning', 'term', 'match', 'fill']) expect(kinds.has(k as never)).toBe(true);
    // The first unit has worked sums and true/false items, so the lesson should use them.
    expect(kinds.has('calc') || kinds.has('tf')).toBe(true);
    expect(plan.questions.length).toBeLessThanOrEqual(22);
  });

  it('respects the daily cap on new terms', () => {
    let p: Progress = newProgress();
    p = { ...p, settings: { ...p.settings, newPerDay: 4 } };
    for (const id of pathTermIds.slice(0, 4)) p = graduate(introduce(p, id, today), id, today);
    expect(buildLesson(p, today, seededRng(2))).toBeNull();
    expect(buildLesson(p, today, seededRng(2), true)?.kind).toBe('new');
  });

  it('clears reviews first when many are waiting', () => {
    let p = newProgress();
    const yesterday = '2026-11-03';
    for (const id of pathTermIds.slice(0, 15)) p = graduate(introduce(p, id, yesterday), id, yesterday);
    const plan = buildLesson(p, today, seededRng(3))!;
    expect(plan.kind).toBe('review');
    expect(plan.reviewIds.length).toBe(12);
  });
});

describe('questions', () => {
  it('always include the right answer once, with 4 options and no duplicates', () => {
    const rng = seededRng(4);
    for (const t of termById.values()) {
      for (const q of [meaningQuestion(t, rng), termQuestion(t, rng), fillQuestion(t, rng)]) {
        if (q.kind === 'intro' || q.kind === 'match') continue;
        expect(q.options.length).toBe(4);
        expect(new Set(q.options).size).toBe(4);
        expect(q.answer).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('never gives the term away in a definition prompt', () => {
    for (const t of termById.values()) {
      const prompt = promptFor(t).toLowerCase();
      for (const n of [t.term, ...(t.aliases ?? [])].filter((x) => x.length > 3)) {
        expect(prompt.includes(n.toLowerCase()), `${t.id}: ${prompt}`).toBe(false);
      }
    }
  });
});

describe('worked sums and true or false', () => {
  it('keep the right answer after shuffling', () => {
    for (const t of termById.values()) {
      for (const c of t.calcs ?? []) {
        for (let seed = 0; seed < 5; seed++) {
          const q = calcQuestion({ ...t, calcs: [c] }, seededRng(seed))!;
          if (q.kind !== 'calc') throw new Error('expected calc');
          expect(q.options[q.answer]).toBe(c.options[c.answer]);
          expect(new Set(q.options).size).toBe(4);
        }
      }
      for (const f of t.tf ?? []) {
        const q = tfQuestion({ ...t, tf: [f] }, seededRng(1))!;
        expect(q.kind === 'tf' && q.options[q.answer]).toBe(f.a ? 'True' : 'False');
      }
    }
  });

  it('are used for well-known terms in reviews', () => {
    const delta = termById.get('delta')!;
    const kinds = new Set(Array.from({ length: 60 }, (_, i) => reviewQuestion(delta, 4, seededRng(i)).kind));
    expect(kinds.has('calc')).toBe(true);
    expect(kinds.has('fill')).toBe(true);
    const plain = termById.get('ltp')!;
    expect(new Set(Array.from({ length: 30 }, (_, i) => reviewQuestion(plain, 4, seededRng(i)).kind))).toEqual(new Set(['fill']));
  });

  it('retry a missed true/false as a meaning question, not a coin flip', () => {
    const t = termById.get('delta')!;
    const q = tfQuestion(t, seededRng(2))!;
    expect(retryQuestion(q, seededRng(3)).kind).toBe('meaning');
    const c = calcQuestion(t, seededRng(2))!;
    const r = retryQuestion(c, seededRng(9));
    expect(r.kind).toBe('calc');
    if (r.kind === 'calc' && c.kind === 'calc') expect(r.options[r.answer]).toBe(c.options[c.answer]);
  });

  it('puts the Greeks and quant core into the first pass', () => {
    for (const id of ['delta', 'gamma', 'theta', 'vega', 'sharpe-ratio', 'beta', 'var']) expect(coreTermIds).toContain(id);
    for (const id of ['vanna', 'vomma', 'charm', 'p-value', 'overfitting']) expect(coreTermIds).not.toContain(id);
    expect(pathTermIds).toContain('vanna');
  });
});
