import { describe, expect, it } from 'vitest';
import { path } from './content';
import {
  act,
  EXPIRY,
  heldPnl,
  markBook,
  newDay,
  newExpiryRound,
  openBook,
  optionDelta,
  optionPrice,
  playbook,
  playbookPath,
  premiumOf,
  scoreExpiry,
  type Action,
  type Call,
  type Day,
} from './expiry';
import { gameOf } from './games';
import { seededRng, type Rng } from './questions';

/** A day with a fixed path: Nifty at 9:15, the six checks and the close. */
const fixedDay = (spots: number[], over: Partial<Day> = {}): Day => ({ kind: 'pin', strike: 25_000, spots, vols: Array(7).fill(0.12), event: null, ...over });

function playRound(seed: number, choose: (ok: Action[], rng: Rng) => Action) {
  const rng = seededRng(seed);
  const days = newExpiryRound(rng);
  const calls: Call[] = [];
  const pnls: number[] = [];
  days.forEach((day, d) => {
    let book = openBook(day);
    for (let i = 1; i <= EXPIRY.checks.length && !book.closed; i++) {
      const ruling = playbook(day, book, i);
      const action = choose(ruling.ok, rng);
      calls.push({ day: d, step: i, action, ruling, right: ruling.ok.includes(action) });
      book = act(day, book, i, action);
    }
    pnls.push(markBook(day, book, EXPIRY.checks.length + 1).pnl);
  });
  return scoreExpiry(calls, pnls);
}
const passRate = (choose: (ok: Action[], rng: Rng) => Action, n = 1000) => {
  let k = 0;
  for (let s = 1; s <= n; s++) if (playRound(s, choose).passed) k++;
  return k / n;
};

describe('expiry day: pricing and the book', () => {
  it('prices options by Black-Scholes and settles them at intrinsic value', () => {
    const c = optionPrice('call', 25_000, 25_000, 0.12, 375);
    const p = optionPrice('put', 25_000, 25_000, 0.12, 375);
    // A day of 12% vol on trading time: the at-the-money straddle is about 0.8 × 25,000 × 0.12 / √252.
    expect(c + p).toBeGreaterThan(140);
    expect(c + p).toBeLessThan(160);
    expect(optionPrice('call', 25_100, 25_000, 0.12, 100) - optionPrice('put', 25_100, 25_000, 0.12, 100)).toBeCloseTo(100, 6);
    expect(optionPrice('put', 24_900, 25_000, 0.12, 0)).toBe(100);
    expect(optionDelta('call', 25_000, 25_000, 0.12, 200)).toBeCloseTo(0.5, 1);
  });

  it('collects the premium, pays for wings, zeroes delta with a hedge and locks P&L on a close', () => {
    const day = fixedDay([25_000, 25_100, 25_150, 25_150, 25_150, 25_150, 25_150, 25_150]);
    const book = openBook(day);
    expect(book.cash).toBeCloseTo(premiumOf(day), 9);
    expect(markBook(day, book, 0).pnl).toBeCloseTo(0, 9);
    const winged = act(day, book, 1, 'wings');
    expect(winged.cash).toBeCloseTo(book.cash - markBook(day, book, 1).wings, 9);
    const hedged = act(day, book, 1, 'hedge');
    expect(markBook(day, hedged, 1).delta).toBeCloseTo(0, 2);
    const closed = act(day, book, 2, 'close');
    expect(markBook(day, closed, 7).pnl).toBeCloseTo(markBook(day, book, 2).pnl, 9);
    // Held untouched, the straddle settles at 150 points of intrinsic value.
    expect(heldPnl(day)).toBeCloseTo(premiumOf(day) - 150, 6);
  });

  it('deals one day of each kind, with the event day pricing in RBI and the pin day ending near the strike', () => {
    for (let s = 1; s <= 200; s++) {
      const days = newExpiryRound(seededRng(s));
      expect(days.map((d) => d.kind).sort()).toEqual(['event', 'pin', 'trend']);
      const ev = days.find((d) => d.kind === 'event')!;
      expect(ev.event?.minute).toBe(45);
      // IV is higher before the policy than after it.
      expect(ev.vols[0]).toBeGreaterThan(ev.vols[2]);
      const pin = days.find((d) => d.kind === 'pin')!;
      expect(Math.abs(pin.spots[7] - pin.strike)).toBeLessThan(120);
      for (const d of days) expect(d.strike % 50).toBe(0);
    }
  });
});

describe('expiry day: the playbook', () => {
  it('stops out at half the premium, before anything else', () => {
    const day = fixedDay([25_000, 25_400, 25_400, 25_400, 25_400, 25_400, 25_400, 25_400]);
    const r = playbook(day, openBook(day), 1);
    expect(r).toMatchObject({ ok: ['close'], rule: 1, must: true });
  });

  it('buys wings before the event, and only then', () => {
    const day = fixedDay([25_000, 25_005, 25_000, 25_000, 25_000, 25_000, 25_000, 25_000], { kind: 'event', event: { minute: 45, name: 'RBI policy at 10:00' } });
    const book = openBook(day);
    expect(playbook(day, book, 1)).toMatchObject({ ok: ['wings'], rule: 2, must: true });
    expect(playbook(day, act(day, book, 1, 'wings'), 1).rule).not.toBe(2);
    expect(playbook(day, book, 2).rule).not.toBe(2);
  });

  it('hedges a big delta before 14:30, and in the last hour closes or holds instead', () => {
    const day = fixedDay([25_000, 25_000, 25_000, 25_090, 25_090, 25_030, 25_090, 25_090]);
    const book = openBook(day);
    expect(playbook(day, book, 3)).toMatchObject({ ok: ['hedge'], rule: 4 });
    expect(playbook(day, book, 5)).toMatchObject({ ok: ['hold'], rule: 3 });
    expect(playbook(day, book, 6)).toMatchObject({ ok: ['close'], rule: 3, must: true });
    expect(playbook(day, book, 1)).toMatchObject({ ok: ['hold'], rule: 5 });
  });

  it('accepts either call near a line', () => {
    const day = fixedDay([25_000, 25_000, 25_000, 25_000, 25_000, 25_055, 25_045, 25_000]);
    const book = openBook(day);
    expect(playbook(day, book, 5).ok.sort()).toEqual(['close', 'hold']);
    expect(playbook(day, book, 6).ok.sort()).toEqual(['close', 'hold']);
  });
});

describe('expiry day: balance', () => {
  it('passes the playbook every time and fails the shortcuts', () => {
    expect(passRate((ok) => ok[0])).toBe(1);
    expect(passRate(() => 'hold')).toBeLessThan(0.01);
    expect(passRate((_ok, rng) => (['hold', 'hedge', 'wings', 'close'] as Action[])[Math.floor(rng() * 4)])).toBeLessThan(0.01);
    expect(passRate((ok) => (ok[0] === 'wings' ? 'hold' : ok[0]))).toBe(0);
    expect(passRate((ok) => (ok[0] === 'hedge' ? 'hold' : ok[0]))).toBeLessThan(0.2);
  });

  it('cuts the worst day and wins on trending days, at some cost on quiet ones', () => {
    let worstBook = 0;
    let worstHeld = 0;
    const sum: Record<string, [number, number]> = { pin: [0, 0], trend: [0, 0], event: [0, 0] };
    for (let s = 1; s <= 1000; s++) {
      for (const kind of ['pin', 'trend', 'event'] as const) {
        const d = newDay(kind, seededRng(s));
        const p = playbookPath(d).pnl;
        const h = heldPnl(d);
        worstBook = Math.min(worstBook, p);
        worstHeld = Math.min(worstHeld, h);
        sum[kind][0] += p;
        sum[kind][1] += h;
      }
    }
    expect(worstBook).toBeGreaterThan(worstHeld / 2);
    expect(sum.trend[0]).toBeGreaterThan(sum.trend[1]);
    expect(sum.pin[0]).toBeLessThan(sum.pin[1]);
    expect(sum.pin[0] + sum.trend[0] + sum.event[0]).toBeGreaterThan(sum.pin[1] + sum.trend[1] + sum.event[1]);
  });
});

describe('expiry day on the track', () => {
  it('follows the short straddle case in options', () => {
    const order = path.map((r) => r.unit.id);
    expect(gameOf('o13')).toBe('expiry');
    expect(order.indexOf('o13')).toBeGreaterThan(order.indexOf('o7'));
  });
});
