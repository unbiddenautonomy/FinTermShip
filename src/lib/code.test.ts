import { describe, expect, it } from 'vitest';
import { path } from './content';
import { CODE, CODE_COUNT, CODE_ITEMS, codePassed, newCodeRound } from './code';
import { gameOf } from './games';
import { seededRng } from './questions';

describe('code reading', () => {
  it('has enough snippets of each kind for varied rounds', () => {
    expect(CODE_ITEMS.filter((i) => i.kind === 'output').length).toBeGreaterThanOrEqual(2 * CODE.outputs);
    expect(CODE_ITEMS.filter((i) => i.kind === 'bug').length).toBeGreaterThanOrEqual(2 * CODE.bugs);
    expect(new Set(CODE_ITEMS.map((i) => i.id)).size).toBe(CODE_ITEMS.length);
  });

  it('deals six outputs and four bugs, with the right option where it says', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = newCodeRound(seededRng(seed));
      expect(r).toHaveLength(CODE_COUNT);
      expect(r.filter((q) => q.item.kind === 'bug')).toHaveLength(CODE.bugs);
      for (const q of r) expect(q.options[q.answer]).toBe(q.item.options[0]);
    }
  });

  it('passes a careful reader and fails a guesser', () => {
    expect(codePassed(CODE_COUNT)).toBe(true);
    const rng = seededRng(7);
    let passed = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const r = newCodeRound(seededRng(seed));
      if (codePassed(r.filter((q) => Math.floor(rng() * 4) === q.answer).length)) passed++;
    }
    expect(passed / 1000).toBeLessThan(0.01);
  });

  it('sits on the quant track after the risk desk', () => {
    const order = path.map((r) => r.unit.id);
    expect(gameOf('q16')).toBe('code');
    expect(order.indexOf('q16')).toBeGreaterThan(order.indexOf('q15'));
  });
});
