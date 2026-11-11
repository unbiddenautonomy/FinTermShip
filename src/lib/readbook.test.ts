import { describe, expect, it } from 'vitest';
import { path } from './content';
import { gameOf } from './games';
import { seededRng } from './questions';
import { ITEMS, microprice, newReadBook, passedReadBook, READBOOK, upOdds } from './readbook';

const rounds = Array.from({ length: 300 }, (_, i) => newReadBook(seededRng(i + 1)));

describe('read the book: items', () => {
  it('follows the pattern, with one right answer among distinct options', () => {
    for (const items of rounds) {
      expect(items.map((it) => it.kind)).toEqual(READBOOK.pattern);
      for (const it of items) {
        expect(new Set(it.options).size).toBe(it.options.length);
        expect(it.answer).toBeGreaterThanOrEqual(0);
        expect(it.answer).toBeLessThan(it.options.length);
      }
    }
  });

  it('leans every next-tick book clearly one way, toward more size and more buying', () => {
    expect(upOdds(3000, 500, 4, 1)).toBeGreaterThan(0.7);
    expect(upOdds(500, 3000, 1, 4)).toBeLessThan(0.3);
    expect(microprice({ price: 100, size: 900 }, { price: 100.05, size: 100 })).toBeCloseTo(100.045, 6);
    let favouredWon = 0;
    let n = 0;
    for (const items of rounds)
      for (const it of items.filter((x) => x.kind === 'tick')) {
        const b = it.book!;
        expect(Math.abs(b.pUp - 0.5)).toBeGreaterThanOrEqual(READBOOK.minEdge);
        expect(it.answer).toBe(b.pUp > 0.5 ? 0 : 1);
        expect(b.asks[0].price - b.bids[0].price).toBeCloseTo(READBOOK.tick, 6);
        favouredWon += (b.up ? 0 : 1) === it.answer ? 1 : 0;
        n++;
      }
    // The likelier way wins about two times in three, not every time.
    expect(favouredWon / n).toBeGreaterThan(0.6);
    expect(favouredWon / n).toBeLessThan(0.8);
  });

  it('works markouts in ticks, signed so that positive is good for you', () => {
    for (const items of rounds.slice(0, 50))
      for (const it of items.filter((x) => x.kind === 'markout')) {
        const m = it.prompt.match(/You (sold|bought) [\d,]+ shares at ₹([\d,]+\.\d\d)\. Five seconds later the mid is ₹([\d,]+\.\d\d)/)!;
        const [p, mid] = [Number(m[2].replace(/,/g, '')), Number(m[3].replace(/,/g, ''))];
        const k = Math.round((m[1] === 'sold' ? p - mid : mid - p) / READBOOK.tick);
        const shown = it.options[it.answer].replace('−', '-').replace(/ ticks?/, '');
        expect(Number(shown)).toBe(k);
      }
  });
});

describe('read the book: balance', () => {
  it('passes a perfect reader and fails a guesser', () => {
    expect(passedReadBook(ITEMS)).toBe(true);
    const rng = seededRng(99);
    let passed = 0;
    for (const items of rounds) {
      const right = items.filter((it) => Math.floor(rng() * it.options.length) === it.answer).length;
      if (passedReadBook(right)) passed++;
    }
    expect(passed / rounds.length).toBeLessThan(0.05);
    expect(ITEMS).toBe(12);
  });

  it('comes after the unit on venues and hidden liquidity', () => {
    const order = path.map((r) => r.unit.id);
    expect(gameOf('s12')).toBe('readbook');
    expect(order.indexOf('s12')).toBeGreaterThan(order.indexOf('s5'));
  });
});
