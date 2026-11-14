import { describe, expect, it } from 'vitest';
import headlinesJson from '../../data/modes/headlines.json';
import boardsJson from '../../data/modes/finnections.json';
import { buildPacks } from '../cardData';
import { categories, termById } from '../content';
import { addDays } from '../dates';
import { seededRng } from '../questions';
import { graduate, introduce, newProgress } from '../scheduler';
import type { Progress } from '../types';
import { modeRecord } from './knowledge';
import {
  access,
  finishRound,
  levelState,
  nextLevel,
  pickRound,
  playable,
  recordBoard,
  recordHeadline,
  ROUND_INDEX,
  ROUND_SIZE,
  type Board,
  type Headline,
  type RoundMode,
} from './rounds';

const today = '2026-11-13';
const headlines = headlinesJson as Headline[];
const boards = boardsJson as Board[];
const phase3 = new Set(categories.filter((c) => c.phase === 3).flatMap((c) => c.terms.map((t) => t.id)));
const all = Object.fromEntries(buildPacks());

/** Meet these terms, each at a step and due on a given day. */
function learner(ids: string[], step = 2, due = addDays(today, 5)): Progress {
  let p = newProgress();
  for (const id of new Set(ids)) {
    p = graduate(introduce(p, id, addDays(today, -30)), id, addDays(today, -30));
    p = { ...p, terms: { ...p.terms, [id]: { ...p.terms[id], step, due } } };
  }
  return p;
}
const termsOf = (mode: RoundMode, level?: number) => ROUND_INDEX[mode].filter((x) => level === undefined || x.level === level).flatMap((x) => x.terms);

describe('Headline Desk and Finnections content', () => {
  it('has plenty at every level, and the index the app ships matches it', () => {
    for (const l of [1, 2, 3]) {
      expect(headlines.filter((h) => h.level === l).length).toBeGreaterThanOrEqual(25);
      expect(boards.filter((b) => b.level === l).length).toBeGreaterThanOrEqual(15);
    }
    expect(ROUND_INDEX.headline.map((x) => [x.id, x.level])).toEqual(headlines.map((h) => [h.id, h.level]));
    expect(ROUND_INDEX.finnections.map((x) => [x.id, x.level])).toEqual(boards.map((b) => [b.id, b.level]));
    for (const h of headlines) expect(ROUND_INDEX.headline.find((x) => x.id === h.id)!.terms).toEqual([...new Set(h.items.map((i) => i.term))].sort());
  });

  it('only uses real terms, with tiles that all read differently', () => {
    for (const h of headlines) for (const i of h.items) expect(termById.has(i.term), `${h.id}: ${i.term}`).toBe(true);
    for (const b of boards) {
      const ids = b.groups.flatMap((g) => g.terms);
      expect(new Set(ids).size, b.id).toBe(16);
      expect(new Set(ids.map((id) => termById.get(id)!.term.toLowerCase())).size, b.id).toBe(16);
    }
  });

  it('keeps every item that uses a phase 3 term in the phase 3 packs', () => {
    const h = all['headlines'] as Headline[];
    const h3 = all['headlines:p3'] as Headline[];
    expect(h.length + h3.length).toBe(headlines.length);
    expect(h.every((x) => x.items.every((i) => !phase3.has(i.term)))).toBe(true);
    expect(h3.every((x) => x.items.some((i) => phase3.has(i.term)))).toBe(true);
    const b = all['finnections'] as Board[];
    const b3 = all['finnections:p3'] as Board[];
    expect(b.length + b3.length).toBe(boards.length);
    expect(b.every((x) => x.groups.every((g) => g.terms.every((t) => !phase3.has(t))))).toBe(true);
    expect(b3.length).toBeGreaterThan(0);
  });

});

describe('when the modes open', () => {
  it('stay shut for a new learner, saying how many terms away they are', () => {
    for (const m of ['headline', 'finnections'] as const) {
      const a = access(newProgress(), m);
      expect(a.open).toBe(false);
      expect(a.gap).toBeGreaterThan(0);
    }
  });

  it('open once a full level 1 round only uses met terms', () => {
    const three = ROUND_INDEX.headline.filter((x) => x.level === 1).slice(0, 3);
    const two = learner(three.slice(0, 2).flatMap((x) => x.terms));
    if (playable(two, 'headline').filter((x) => x.level === 1).length < 3) {
      expect(access(two, 'headline').open).toBe(false);
      expect(access(two, 'headline').gap).toBeGreaterThan(0);
      expect(access(two, 'headline').gap).toBeLessThanOrEqual(three[2].terms.length);
    }
    const q = learner(three.flatMap((x) => x.terms));
    expect(access(q, 'headline').open).toBe(true);
    const board = ROUND_INDEX.finnections.find((x) => x.level === 1)!;
    expect(access(learner(board.terms), 'finnections').open).toBe(true);
  });

  it('never deals an item with a term the learner has not met', () => {
    const p = learner(termsOf('headline', 1).slice(0, 40));
    const ok = new Set(playable(p, 'headline').map((x) => x.id));
    for (let s = 0; s < 20; s++) for (const x of pickRound(p, 'headline', today, seededRng(s))) expect(ok.has(x.id)).toBe(true);
  });
});

describe('levels', () => {
  const everything = (mode: RoundMode) => learner(termsOf(mode));

  it('start at 1 and only rise to a level with a full round to play', () => {
    const p = everything('headline');
    expect(levelState(p, 'headline')).toMatchObject({ level: 1, good: 0, ready: 3 });
    const onlyEasy = learner(termsOf('headline', 1));
    expect(levelState(onlyEasy, 'headline').ready).toBeLessThan(3);
  });

  it('move up after two good rounds in a row, and down after a bad one', () => {
    const s = { level: 1, good: 0, ready: 3 };
    expect(nextLevel(s, 0.9)).toEqual({ level: 1, good: 1 });
    expect(nextLevel({ ...s, good: 1 }, 0.8)).toEqual({ level: 2, good: 0 });
    expect(nextLevel({ ...s, good: 1 }, 0.6)).toEqual({ level: 1, good: 0 });
    expect(nextLevel({ level: 2, good: 1, ready: 3 }, 0.3)).toEqual({ level: 1, good: 0 });
    expect(nextLevel({ level: 1, good: 0, ready: 3 }, 0)).toEqual({ level: 1, good: 0 });
    // Earned, but nothing to play at the next level yet: the streak waits.
    expect(nextLevel({ level: 1, good: 1, ready: 1 }, 1)).toEqual({ level: 1, good: 2 });
  });

  it('deal unseen items at the level first, then fill from the levels below', () => {
    let p = everything('headline');
    const first = pickRound(p, 'headline', today, seededRng(1));
    expect(first).toHaveLength(ROUND_SIZE.headline);
    expect(first.every((x) => x.level === 1)).toBe(true);
    p = finishRound(p, 'headline', today, first.map((x) => x.id), 1);
    const second = pickRound(p, 'headline', today, seededRng(1));
    expect(second.some((x) => first.some((f) => f.id === x.id))).toBe(false);
    // Level 3 with only one level 3 headline met: the rest of the round comes from below.
    const one3 = ROUND_INDEX.headline.find((x) => x.level === 3)!;
    let q = learner([...termsOf('headline', 1), ...termsOf('headline', 2), ...one3.terms]);
    q = { ...q, modes: { headline: { ...modeRecord(q, 'headline'), level: 2 } } };
    const r = pickRound(q, 'headline', today, seededRng(3));
    expect(r.map((x) => x.level)).toEqual([2, 2, 2]);
  });

  it('put items with a term due today ahead of the rest', () => {
    const items = ROUND_INDEX.finnections.filter((x) => x.level === 1);
    let p = learner(items.flatMap((x) => x.terms));
    // A board with a term no other board here uses, so only it has a term due.
    const target = items.find((x) => x.terms.some((t) => items.filter((y) => y.terms.includes(t)).length === 1))!;
    const t = target.terms.find((id) => items.filter((y) => y.terms.includes(id)).length === 1)!;
    p = { ...p, terms: { ...p.terms, [t]: { ...p.terms[t], due: today } } };
    p = finishRound(p, 'finnections', today, items.map((x) => x.id), 0.5);
    expect(pickRound(p, 'finnections', today, seededRng(9))[0].id).toBe(target.id);
  });

  it('record the round: seen items, the level, and a session', () => {
    const p = everything('finnections');
    let q = finishRound(p, 'finnections', today, ['f101'], 1);
    q = finishRound(q, 'finnections', today, ['f102'], 1);
    const r = modeRecord(q, 'finnections');
    expect(r.sessions).toBe(2);
    expect(r.seen).toEqual({ f101: today, f102: today });
    expect(levelState(q, 'finnections').level).toBe(2);
  });
});

describe('answers go to the shared record', () => {
  const h = headlines.find((x) => x.level === 2 && new Set(x.items.map((i) => i.term)).size === x.items.length)!;
  const right = h.items.map((i) => i.move);
  const flip = (m: 'up' | 'down') => (m === 'up' ? 'down' : 'up');

  it('a headline called fully right counts as a review of each due term', () => {
    const p = learner(h.items.map((i) => i.term), 2, today);
    const q = recordHeadline(p, h, right, 3000, today);
    for (const i of h.items) expect(q.terms[i.term].step).toBe(3);
    expect(modeRecord(q, 'headline').answers).toBe(h.items.length);
  });

  it('a partly wrong headline is only true/false calls: the misses come back tomorrow, nothing steps up', () => {
    const p = learner(h.items.map((i) => i.term), 2, addDays(today, 6));
    const picks = right.map((m, i) => (i === 0 ? flip(m) : m));
    const q = recordHeadline(p, h, picks, 3000, today);
    expect(q.terms[h.items[0].term]).toMatchObject({ step: 2, due: addDays(today, 1) });
    for (const i of h.items.slice(1)) expect(q.terms[i.term]).toMatchObject({ step: 2, due: addDays(today, 6) });
  });

  it('a board: found groups are reviews, the free last group is practice, missed groups come back tomorrow', () => {
    const b = boards[0];
    const p = learner(b.groups.flatMap((g) => g.terms), 2, today);
    const won = recordBoard(p, b, b.groups.map((g) => g.name), true, 2000, today);
    for (const g of b.groups.slice(0, 3)) for (const t of g.terms) expect(won.terms[t].step).toBe(3);
    for (const t of b.groups[3].terms) expect(won.terms[t].step).toBe(2);
    const later = learner(b.groups.flatMap((g) => g.terms), 2, addDays(today, 6));
    const lost = recordBoard(later, b, [b.groups[0].name], false, 2000, today);
    for (const t of b.groups[1].terms) expect(lost.terms[t]).toMatchObject({ step: 2, due: addDays(today, 1) });
    expect(modeRecord(lost, 'finnections').answers).toBe(16);
  });
});
