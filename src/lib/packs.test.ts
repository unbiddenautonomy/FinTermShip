import { afterEach, describe, expect, it } from 'vitest';
import outline from '../data/outline.json';
import { STRATEGIES } from './backtest';
import { buildPacks } from './cardData';
import { caseById, caseSummary, unitById } from './content';
import { fermiItems, newFermiRound } from './fermi';
import { clips, newMeetingRound } from './meeting';
import { applyPacks, clearPacks, hasPack, packOf } from './packs';
import { CASE_UNSEEN, practiceAbout } from './practice';
import { seededRng } from './questions';

const all = Object.fromEntries(buildPacks());

// Each test may empty the packs; put every pack back after it.
afterEach(() => {
  clearPacks();
  applyPacks(all);
});

describe('packs: desk cases and game content from the server', () => {
  it('names the pack each case and content game needs, and none for the rest', () => {
    const cases = [...unitById.values()].filter((u) => u.kind === 'case');
    expect(cases.length).toBe(Object.keys(all).filter((id) => id.startsWith('case:')).length);
    for (const u of cases) expect(packOf(u.id)).toBe(`case:${u.id}`);
    const games = [...unitById.values()].filter((u) => u.kind === 'game');
    const byGame = Object.fromEntries(games.map((u) => [u.game, packOf(u.id)]));
    expect(byGame.meeting).toBe('meeting');
    expect(byGame.fermi).toBe('fermi');
    expect(byGame.backtest).toBe('backtest');
    for (const u of games) if (!['meeting', 'fermi', 'backtest'].includes(u.game!)) expect(packOf(u.id), u.id).toBeNull();
    const drill = [...unitById.values()].find((u) => u.kind === 'drill');
    if (drill) expect(packOf(drill.id)).toBeNull();
    expect(packOf('no-such-unit')).toBeNull();
  });

  it('starts empty without packs, and fills each screen’s data as its pack arrives', () => {
    clearPacks();
    expect(caseById.size).toBe(0);
    expect(clips.length + fermiItems.length + STRATEGIES.length).toBe(0);
    expect(hasPack('meeting')).toBe(false);
    applyPacks({ meeting: all.meeting, 'case:o7': all['case:o7'], nonsense: [1, 2] });
    expect(hasPack('meeting')).toBe(true);
    expect(hasPack('case:o7')).toBe(true);
    expect(hasPack('nonsense')).toBe(false);
    expect(clips.length).toBe((all.meeting as unknown[]).length);
    expect([...caseById.keys()]).toEqual(['o7']);
    expect(fermiItems.length).toBe(0);
    expect(newMeetingRound(seededRng(1)).length).toBeGreaterThan(0);
    applyPacks({ fermi: all.fermi, backtest: all.backtest });
    expect(newFermiRound(seededRng(2)).length).toBeGreaterThan(0);
    expect(STRATEGIES.length).toBe((all.backtest as unknown[]).length);
  });

  it('shows a case’s opening before its pack arrives, except in phase 3, from the outline alone', () => {
    clearPacks();
    for (const [id, c] of Object.entries(outline.cases)) {
      expect(caseSummary.get(id)?.steps).toBe(c.steps);
      const phase3 = unitById.get(id) && (outline.categories.find((cat) => cat.units.some((u) => u.id === id)) as { phase?: number } | undefined)?.phase === 3;
      if (phase3) expect(practiceAbout(id)).toBe(CASE_UNSEEN);
      else expect(practiceAbout(id)).toBe((all[`case:${id}`] as { setup: string }).setup);
    }
    // Once a phase 3 case has come, its sheet shows its own opening.
    const p3 = Object.keys(outline.cases).find((id) => practiceAbout(id) === CASE_UNSEEN)!;
    applyPacks({ [`case:${p3}`]: all[`case:${p3}`] });
    expect(practiceAbout(p3)).toBe((all[`case:${p3}`] as { setup: string }).setup);
  });
});
