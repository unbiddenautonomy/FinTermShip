import { describe, expect, it } from 'vitest';
import outline from '../data/skeleton.json';
import { buildPacks } from './cardData';
import { caseSummary, unitById } from './content';
import { CASE_UNSEEN, practiceAbout } from './practice';

const all = Object.fromEntries(buildPacks());

describe('desk cases before they are dealt', () => {
  it('shows a case’s opening from the skeleton alone, except in phase 3', () => {
    for (const [id, c] of Object.entries(outline.cases)) {
      expect(caseSummary.get(id)?.steps).toBe(c.steps);
      const phase3 = unitById.get(id) && (outline.categories.find((cat) => cat.units.some((u) => u.id === id)) as { phase?: number } | undefined)?.phase === 3;
      if (phase3) expect(practiceAbout(id)).toBe(CASE_UNSEEN);
      else expect(practiceAbout(id)).toBe((all[`case:${id}`] as { setup: string }).setup);
    }
    expect(Object.keys(outline.cases).some((id) => practiceAbout(id) === CASE_UNSEEN)).toBe(true);
  });
});
