import { describe, expect, it } from 'vitest';
import { termById } from './content';
import { claimsFor } from './modes/claims';
import { fillQuestion, seededRng, termQuestion } from './questions';
import type { Question } from './types';

const optionsOf = (q: Question): string[] => ('options' in q ? q.options : []);

const withOverlaps = [...termById.values()].filter((t) => t.overlaps?.length);

describe('overlapping terms (P&L and realised P&L, PAT and earnings)', () => {
  it('are listed on both sides and point at real terms', () => {
    expect(withOverlaps.length).toBeGreaterThan(0);
    for (const t of withOverlaps) {
      for (const id of t.overlaps!) {
        expect(id, t.id).not.toBe(t.id);
        expect(termById.get(id)?.overlaps, `${id} should list ${t.id}`).toContain(t.id);
      }
    }
  });

  it('never sit beside each other as answer and wrong option', () => {
    for (const t of withOverlaps) {
      const bad = new Set(t.overlaps);
      for (let seed = 1; seed <= 40; seed++) {
        for (const q of [
          termQuestion(t, seededRng(seed)),
          fillQuestion(t, seededRng(seed)),
          fillQuestion(t, seededRng(seed), false, undefined, true),
        ]) {
          const hit = optionsOf(q).filter((o) => bad.has(o));
          expect(hit, `${q.kind} for ${t.id} offers ${hit.join(', ')}`).toEqual([]);
        }
      }
    }
  });

  it('keep the P&L question from offering realised or unrealised P&L', () => {
    const pnl = termById.get('pnl')!;
    for (let seed = 1; seed <= 200; seed++) {
      const options = optionsOf(termQuestion(pnl, seededRng(seed)));
      expect(options).not.toContain('realised-pnl');
      expect(options).not.toContain('unrealised-pnl');
    }
  });

  it('are never swapped in as a false Call It claim', () => {
    for (const t of withOverlaps) {
      const glosses = t.overlaps!.map((id) => termById.get(id)!.short.toLowerCase());
      for (const c of claimsFor(t, false).filter((c) => c.source === 'swap')) {
        expect(glosses.some((g) => c.text.toLowerCase().includes(g.replace(/\.$/, ''))), `${t.id}: ${c.text}`).toBe(false);
      }
    }
  });

  it('never offer a term listed under alsoFits as a wrong option', () => {
    const listed = [...termById.values()].filter((t) => t.alsoFits?.length);
    expect(listed.length).toBeGreaterThan(0);
    for (const t of listed) {
      const bad = new Set(t.alsoFits);
      for (let seed = 1; seed <= 40; seed++) {
        for (const q of [termQuestion(t, seededRng(seed)), fillQuestion(t, seededRng(seed)), fillQuestion(t, seededRng(seed), false, undefined, true)]) {
          const hit = optionsOf(q).filter((o) => bad.has(o));
          expect(hit, `${q.kind} for ${t.id} offers ${hit.join(', ')}`).toEqual([]);
          expect(optionsOf(q).length, `${q.kind} for ${t.id}`).toBe(4);
        }
      }
    }
  });

  it("don't deal the same false Call It card twice", () => {
    for (const t of termById.values()) {
      const texts = claimsFor(t, false).map((c) => c.text.toLowerCase());
      expect(new Set(texts).size, t.id).toBe(texts.length);
    }
  });
});
