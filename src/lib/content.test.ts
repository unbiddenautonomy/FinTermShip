import { describe, expect, it } from 'vitest';
import careerData from '../data/careers.json';
import { categories, isQuantArea, path, termById, unitById } from './content';
import type { CareerMap } from './types';

const careers = careerData as CareerMap;

describe('rates, macro and the rupee', () => {
  it('sits after market conditions, with policy and the rupee in the core sweep', () => {
    const ids = categories.map((c) => c.id);
    expect(ids.indexOf('macro')).toBe(ids.indexOf('conditions') + 1);
    expect(isQuantArea('macro')).toBe(false);
    const units = path.filter((r) => r.category.id === 'macro').map((r) => [r.unit.id, r.pass]);
    expect(units).toEqual([
      ['m1', 1],
      ['m3', 1],
      ['m6', 2],
      ['m2', 2],
      ['m4', 2],
      ['m5', 2],
    ]);
  });

  it('keeps bonds and the SEBI rules for the second pass of the quant areas', () => {
    expect(unitById.get('f4')).toMatchObject({ categoryId: 'instruments', core: false });
    expect(unitById.get('s7')).toMatchObject({ categoryId: 'micro', core: false });
  });

  it('dates and sources every current rule and rate it quotes', () => {
    for (const id of ['repo-rate', 'sdf', 'msf', 'crr', 'slr', 'inflation-target', 'ops-threshold', 'weekly-expiry', 'minimum-contract-size', 'expiry-day-elm']) {
      const t = termById.get(id)!;
      expect(t.asOf, id).toBeDefined();
      expect(t.source, id).toMatch(/^https:\/\//);
    }
  });

  it("tells white-box and black-box algos apart instead of treating them as one", () => {
    expect(termById.get('black-box-algo')!.aliases).not.toContain('white-box algo');
    expect(termById.get('white-box-algo')!.confusables).toContain('black-box-algo');
  });
});

describe('career map', () => {
  it('points every role and round at units on the track', () => {
    const items = [...careers.roles, ...careers.rounds];
    for (const item of items) for (const id of item.practise) expect(unitById.has(id), id).toBe(true);
    expect(careers.roles.every((r) => r.practise.length > 0)).toBe(true);
    // The rounds walk through what this app trains, from the online test to the market-making game.
    expect(careers.rounds.find((r) => r.name === 'Market-making game')?.practise).toEqual(['s6', 's8', 's9', 's10', 's11']);
  });

  it('sends learners to every unit of the newer areas', () => {
    const linked = new Set([...careers.roles, ...careers.rounds].flatMap((r) => r.practise));
    for (const id of ['fundamentals', 'credit', 'commodities']) {
      const area = categories.find((c) => c.id === id)!;
      for (const u of area.units) expect(linked.has(u.id), u.id).toBe(true);
    }
  });
});
