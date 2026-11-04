import { describe, expect, it } from 'vitest';
import { categories, coreTermIds, path, pathTermIds, termById } from './content';
import { buildLesson } from './lesson';
import { meaningQuestion, promptFor, seededRng, termQuestion, fillQuestion } from './questions';
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
    expect(kinds).toEqual(new Set(['intro', 'meaning', 'term', 'match', 'fill']));
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
