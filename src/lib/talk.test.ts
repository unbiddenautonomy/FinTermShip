import { describe, expect, it } from 'vitest';
import { buildPractice } from './choose';
import { mainTermIds, pathTermIds, talkById, talkItems, talkTerms, termById } from './content';
import { buildLesson } from './lesson';
import { retryQuestion, reviewQuestion, seededRng, talkAbout, talkQuestion } from './questions';
import { graduate, introduce, newProgress } from './scheduler';
import type { Progress, Question } from './types';

const today = '2026-11-04';
const yesterday = '2026-11-03';

/** A learner who has met the first `n` terms of the path. */
function metFirst(n: number, day = yesterday): Progress {
  let p = newProgress();
  for (const id of pathTermIds().slice(0, n)) p = graduate(introduce(p, id, day), id, day);
  return p;
}

const talkQs = (qs: Question[]) => qs.filter((q): q is Extract<Question, { kind: 'talk' }> => q.kind === 'talk');

describe('talk items', () => {
  it('cover all four formats and only use main-track terms', () => {
    const formats = new Set(talkItems.map((i) => i.format));
    expect([...formats].sort()).toEqual(['decode', 'misuse', 'reply', 'say']);
    for (const i of talkItems) for (const id of talkTerms(i)) expect(mainTermIds(), `${i.id} → ${id}`).toContain(id);
  });

  it('keep the right option findable after shuffling', () => {
    const rng = seededRng(11);
    for (const item of talkItems) {
      const q = talkQuestion(item, rng);
      if (q.kind !== 'talk') throw new Error('expected a talk question');
      expect(q.options[q.answer]).toBe(item.options[0]);
      expect([...q.options].sort()).toEqual([...item.options].sort());
      const again = retryQuestion(q, rng);
      expect(again.kind === 'talk' && again.options[again.answer]).toBe(item.options[0]);
    }
  });

  it('never ask about a term the learner has not met', () => {
    for (const n of [4, 30, 120, 300]) {
      for (let seed = 0; seed < 25; seed++) {
        const p = metFirst(n);
        const plan = buildLesson(p, today, seededRng(seed), true, { listen: false });
        if (!plan) continue;
        const known = new Set([...Object.keys(p.terms), ...plan.newIds]);
        for (const q of talkQs(plan.questions)) for (const id of talkTerms(talkById.get(q.itemId)!)) expect(known.has(id), `${q.itemId} needs ${id}`).toBe(true);
      }
    }
  });

  it('show up in lessons once enough terms are met', () => {
    const p = metFirst(250);
    let withTalk = 0;
    for (let seed = 0; seed < 20; seed++) if (talkQs(buildLesson(p, today, seededRng(seed), true, { listen: false })!.questions).length) withTalk++;
    expect(withTalk).toBeGreaterThanOrEqual(8);
    expect(talkAbout([], new Set(), seededRng(1))).toBeNull();
  });

  it('turn up in mature reviews of their term', () => {
    const item = talkItems.find((i) => i.term === 'basis-point' && !i.also?.length)!;
    const term = termById.get(item.term)!;
    const known = new Set(talkTerms(item));
    const kinds = new Set(Array.from({ length: 80 }, (_, i) => reviewQuestion(term, 4, seededRng(i), known).kind));
    expect(kinds.has('talk')).toBe(true);
    // Early steps stay on recognition.
    const early = new Set(Array.from({ length: 80 }, (_, i) => reviewQuestion(term, 1, seededRng(i), known).kind));
    expect(early.has('talk')).toBe(false);
  });

  it('join practice rounds on a unit with an item', () => {
    const item = talkItems.find((i) => !i.also?.length && termById.get(i.term)?.unit === 'b1')!;
    const unitTerms = pathTermIds().filter((id) => termById.get(id)?.unit === 'b1');
    let p = newProgress();
    for (const id of unitTerms) p = graduate(introduce(p, id, yesterday), id, yesterday);
    let seen = false;
    for (let seed = 0; seed < 10 && !seen; seed++) seen = talkQs(buildPractice(p, 'b1', seededRng(seed))!.questions).length > 0;
    expect(item).toBeDefined();
    expect(seen).toBe(true);
  });
});

describe('listen and pick', () => {
  it('asks a new term with a spoken form by ear only when listening is on', () => {
    // Find a lesson whose new terms include one with a spoken form.
    let p = newProgress();
    let plan = buildLesson(p, today, seededRng(1), true, { listen: true })!;
    for (let guard = 0; guard < 40 && !plan.newIds.some((id) => termById.get(id)?.said); guard++) {
      for (const id of plan.newIds) p = graduate(introduce(p, id, yesterday), id, yesterday);
      p = { ...p, terms: Object.fromEntries(Object.entries(p.terms).map(([k, v]) => [k, { ...v, due: '2099-01-01' }])) };
      plan = buildLesson(p, today, seededRng(1), true, { listen: true })!;
    }
    const heard = plan.questions.filter((q) => q.kind === 'listen');
    expect(heard.length).toBe(1);
    expect(termById.get(heard[0].kind === 'listen' ? heard[0].termId : '')?.said).toBeTruthy();
    const quiet = buildLesson(p, today, seededRng(1), true, { listen: false })!;
    expect(quiet.questions.some((q) => q.kind === 'listen')).toBe(false);
  });

  it('falls back to reading the meaning on a retry', () => {
    const t = [...termById.values()].find((x) => x.said)!;
    const q = reviewQuestion(t, 1, seededRng(3), undefined, true);
    const retry = retryQuestion({ kind: 'listen', termId: t.id, options: ['a', 'b', 'c', 'd'], answer: 0, review: true }, seededRng(2));
    expect(['listen', 'meaning', 'term']).toContain(q.kind);
    expect(retry.kind).toBe('meaning');
  });
});
