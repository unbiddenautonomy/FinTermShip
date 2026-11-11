/**
 * Expiry day: manage a short Nifty straddle through the last session.
 *
 * Three expiry days, each a different kind: a quiet day that pins to the
 * strike, a trending day that runs away from it, and a day with an RBI policy
 * at 10:00. Each day you sell the at-the-money straddle at 9:15 and check it
 * six times. At each check you hold, hedge your delta with futures, buy wings
 * (a cheap call and put further out, which cap the loss), or close everything.
 * Whatever is left settles at 15:30 at its intrinsic value.
 *
 * Every call is judged against the desk's written playbook, from the position
 * you actually hold, so the score is about decisions rather than luck:
 *
 * 1. Down half the premium or more: close everything.
 * 2. An event before the next check and no wings yet: buy wings.
 * 3. From 14:30: more than 50 points from the strike, close everything;
 *    otherwise hold. In the last hour, gamma is too big to chase delta.
 * 4. Before 14:30: delta beyond ±0.25, hedge with futures.
 * 5. Otherwise hold, and let time decay work for you.
 *
 * Prices are Black-Scholes on trading time (a 375-minute session, 252 days a
 * year), with no interest. P&L is in Nifty points for one unit of the straddle.
 */
import { normal } from './guess';
import { normCdf } from './payoff';
import { shuffle, type Rng } from './questions';

export const EXPIRY = {
  days: 3,
  /** Minutes after 9:15 of each check. */
  checks: [15, 105, 195, 270, 330, 355],
  session: 375,
  /** Rule 1: close when the loss reaches this share of the premium. Grey zone from `stopGrey`. */
  stop: 0.5,
  stopGrey: 0.4,
  /** Rule 3: from this minute (14:30), close when further than `late` points from the strike. */
  lateFrom: 315,
  late: 50,
  lateGrey: [40, 60] as [number, number],
  /** Rule 4: hedge when the position's delta is beyond this. Grey zone in between. */
  delta: 0.25,
  deltaGrey: [0.2, 0.3] as [number, number],
  /** Wings sit this far from the strike. */
  wingGap: 200,
  /** Pass marks: this share of calls by the playbook, and every stop and every pair of wings before an event. */
  passShare: 0.85,
};

export type DayKind = 'pin' | 'trend' | 'event';
export type Action = 'hold' | 'hedge' | 'wings' | 'close';
export const ACTIONS: Action[] = ['hold', 'hedge', 'wings', 'close'];
export const ACTION_LABEL: Record<Action, string> = {
  hold: 'Hold',
  hedge: 'Hedge delta with futures',
  wings: 'Buy wings',
  close: 'Close everything',
};

export interface Day {
  kind: DayKind;
  strike: number;
  /** Nifty at 9:15, at each check, and at 15:30. */
  spots: number[];
  /** Implied vol at 9:15 and at each check (the close needs none). */
  vols: number[];
  /** Minute of a scheduled event, or null. */
  event: { minute: number; name: string } | null;
}

const YEAR_MINUTES = EXPIRY.session * 252;

/** Black-Scholes with no interest, on minutes left in the session. */
export function optionPrice(kind: 'call' | 'put', spot: number, strike: number, vol: number, minutesLeft: number): number {
  if (minutesLeft <= 0) return Math.max(0, kind === 'call' ? spot - strike : strike - spot);
  const s = vol * Math.sqrt(minutesLeft / YEAR_MINUTES);
  const d1 = (Math.log(spot / strike) + (s * s) / 2) / s;
  const call = spot * normCdf(d1) - strike * normCdf(d1 - s);
  return kind === 'call' ? call : call - spot + strike;
}

export function optionDelta(kind: 'call' | 'put', spot: number, strike: number, vol: number, minutesLeft: number): number {
  if (minutesLeft <= 0) return kind === 'call' ? (spot > strike ? 1 : 0) : spot < strike ? -1 : 0;
  const s = vol * Math.sqrt(minutesLeft / YEAR_MINUTES);
  const d1 = (Math.log(spot / strike) + (s * s) / 2) / s;
  return kind === 'call' ? normCdf(d1) : normCdf(d1) - 1;
}

/** Minute of the session at step i: 0 is 9:15, 1 to 6 the checks, 7 the close. */
export const minuteAt = (i: number) => (i === 0 ? 0 : i <= EXPIRY.checks.length ? EXPIRY.checks[i - 1] : EXPIRY.session);

/** Clock time for a minute of the session, e.g. 195 → "12:30". */
export function clockAt(minute: number): string {
  const m = 9 * 60 + 15 + minute;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** One expiry day of a given kind. */
export function newDay(kind: DayKind, rng: Rng): Day {
  const strike = 24_500 + 50 * Math.floor(rng() * 21);
  const steps = EXPIRY.checks.length + 2;
  const spots = [strike + Math.round((rng() - 0.5) * 30)];
  const baseVol = 0.11 + 0.03 * rng();
  const vols: number[] = [];
  let event: Day['event'] = null;
  const dir = rng() < 0.5 ? -1 : 1;
  // Trend days run 250 to 400 points by the close; event days jump at 10:00, half the time by a lot.
  const trend = kind === 'trend' ? dir * (250 + 150 * rng()) : 0;
  const shock = kind === 'event' ? (rng() < 0.5 ? dir * (150 + 100 * rng()) : dir * 30 * rng()) : 0;
  if (kind === 'event') event = { minute: 45, name: 'RBI policy at 10:00' };
  const realVol = kind === 'pin' ? 0.07 : kind === 'trend' ? 0.08 : 0.08;
  for (let i = 0; i < steps; i++) {
    const m = minuteAt(i);
    if (i > 0) {
      const prev = minuteAt(i - 1);
      const dt = (m - prev) / YEAR_MINUTES;
      let s = spots[i - 1] + spots[0] * realVol * Math.sqrt(dt) * normal(rng) + (trend * (m - prev)) / EXPIRY.session;
      if (event && prev < event.minute && m >= event.minute) s += shock;
      // On a pin day, the last hour drags Nifty towards the strike with the most open interest.
      if (kind === 'pin' && m >= 270) s += 0.5 * (strike - s);
      spots.push(Math.round(s * 20) / 20);
    }
    if (i < steps - 1) {
      const beforeEvent = event && m < event.minute;
      vols.push(kind === 'event' ? (beforeEvent ? baseVol + 0.05 : baseVol - 0.02) : kind === 'trend' && i > 2 ? baseVol + 0.02 : baseVol);
    }
  }
  return { kind, strike, spots, vols, event };
}

export function newExpiryRound(rng: Rng): Day[] {
  return shuffle<DayKind>(['pin', 'trend', 'event'], rng).map((k) => newDay(k, rng));
}

/** What you hold: always the short straddle until closed, maybe wings, maybe futures. */
export interface Book {
  /** Premium collected at 9:15 less anything paid since, plus futures cash. */
  cash: number;
  wings: boolean;
  /** Futures held, in units (+ long), and what was paid for them in total. */
  futures: number;
  futuresCost: number;
  closed: boolean;
}

export interface Mark {
  straddle: number;
  wings: number;
  pnl: number;
  delta: number;
}

/** Value everything at step i of a day. */
export function markBook(day: Day, book: Book, i: number): Mark {
  const spot = day.spots[i];
  const left = EXPIRY.session - minuteAt(i);
  const vol = day.vols[Math.min(i, day.vols.length - 1)];
  const k = day.strike;
  const straddle = optionPrice('call', spot, k, vol, left) + optionPrice('put', spot, k, vol, left);
  const wings = optionPrice('call', spot, k + EXPIRY.wingGap, vol, left) + optionPrice('put', spot, k - EXPIRY.wingGap, vol, left);
  if (book.closed) return { straddle, wings, pnl: book.cash, delta: 0 };
  const sd = optionDelta('call', spot, k, vol, left) + optionDelta('put', spot, k, vol, left);
  const wd = optionDelta('call', spot, k + EXPIRY.wingGap, vol, left) + optionDelta('put', spot, k - EXPIRY.wingGap, vol, left);
  const pnl = book.cash - straddle + (book.wings ? wings : 0) + book.futures * spot - book.futuresCost;
  const delta = -sd + (book.wings ? wd : 0) + book.futures;
  return { straddle, wings, pnl, delta };
}

/** The book at 9:15: short the straddle at its price then. */
export function openBook(day: Day): Book {
  const m = markBook(day, { cash: 0, wings: false, futures: 0, futuresCost: 0, closed: true }, 0);
  return { cash: m.straddle, wings: false, futures: 0, futuresCost: 0, closed: false };
}

/** Do one action at step i. */
export function act(day: Day, book: Book, i: number, a: Action): Book {
  if (book.closed) return book;
  const m = markBook(day, book, i);
  const spot = day.spots[i];
  if (a === 'wings' && !book.wings) return { ...book, wings: true, cash: book.cash - m.wings };
  if (a === 'hedge') {
    const q = Math.round(-m.delta * 100) / 100;
    return { ...book, futures: book.futures + q, futuresCost: book.futuresCost + q * spot };
  }
  if (a === 'close') return { cash: m.pnl, wings: false, futures: 0, futuresCost: 0, closed: true };
  return book;
}

/** The premium collected at 9:15. */
export const premiumOf = (day: Day) => openBook(day).cash;

/** Is an event due before the next check? */
export function eventAhead(day: Day, i: number): boolean {
  return !!day.event && minuteAt(i) < day.event.minute && minuteAt(i + 1) >= day.event.minute;
}

export interface Ruling {
  /** The calls the playbook accepts; the first is its own. */
  ok: Action[];
  /** Which rule decided it. */
  rule: 1 | 2 | 3 | 4 | 5;
  /** A call the playbook insists on: a stop, or wings before an event. Missing one fails the round. */
  must: boolean;
  why: string;
}

const pts = (x: number) => `${Math.round(Math.abs(x))} point${Math.round(Math.abs(x)) === 1 ? '' : 's'}`;

/** What the playbook says at step i, from the book you hold. */
export function playbook(day: Day, book: Book, i: number): Ruling {
  const m = markBook(day, book, i);
  const premium = premiumOf(day);
  const loss = -m.pnl / premium;
  const minute = minuteAt(i);
  const away = Math.abs(day.spots[i] - day.strike);
  const grey: Action[] = [];
  if (loss >= EXPIRY.stop) return { ok: ['close'], rule: 1, must: true, why: `You're down ${pts(m.pnl)}, more than half the ${pts(premium)} you collected: close everything.` };
  if (loss >= EXPIRY.stopGrey) grey.push('close');
  if (minute >= EXPIRY.lateFrom) {
    if (away > EXPIRY.lateGrey[1])
      return { ok: ['close'], rule: 3, must: true, why: `It's after 14:30 and Nifty is ${pts(away)} from your strike: close. Gamma is too big to chase delta in the last hour.` };
    if (away > EXPIRY.late) return { ok: ['close', 'hold'], rule: 3, must: false, why: `After 14:30, ${pts(away)} from the strike is right at the line: closing or holding were both fine.` };
    if (away > EXPIRY.lateGrey[0]) return { ok: ['hold', 'close'], rule: 3, must: false, why: `After 14:30, ${pts(away)} from the strike is close to the line: holding or closing were both fine.` };
    return { ok: ['hold', ...grey], rule: 3, must: false, why: `After 14:30 and only ${pts(away)} from the strike: hold, and don't chase delta. Each minute now is pure time decay for you.` };
  }
  if (eventAhead(day, i) && !book.wings)
    return { ok: ['wings', ...grey], rule: 2, must: true, why: `${day.event!.name} comes before the next check: buy wings so a big move can't run your loss past them.` };
  const d = Math.abs(m.delta);
  if (d > EXPIRY.deltaGrey[1]) return { ok: ['hedge', ...grey], rule: 4, must: false, why: `Your delta is ${signed(m.delta)}, past ±${EXPIRY.delta}: hedge it with futures.` };
  if (d > EXPIRY.delta) return { ok: ['hedge', 'hold', ...grey], rule: 4, must: false, why: `Your delta is ${signed(m.delta)}, just past ±${EXPIRY.delta}: hedging or holding were both fine.` };
  if (d > EXPIRY.deltaGrey[0]) return { ok: ['hold', 'hedge', ...grey], rule: 4, must: false, why: `Your delta is ${signed(m.delta)}, near ±${EXPIRY.delta}: holding or hedging were both fine.` };
  return { ok: ['hold', ...grey], rule: 5, must: false, why: `Delta ${signed(m.delta)}, no event ahead and no big loss: hold, and let time decay work for you.` };
}

export const signed = (x: number) => {
  const r = Math.round(x * 100) / 100;
  return r > 0 ? `+${r.toFixed(2)}` : r < 0 ? `−${Math.abs(r).toFixed(2)}` : '0.00';
};

export interface Call {
  day: number;
  step: number;
  action: Action;
  ruling: Ruling;
  right: boolean;
}

/** Play a whole day from a list of calls, one per check while the book is open. */
export function playDay(day: Day, calls: Action[]): { book: Book; rulings: Ruling[]; pnl: number } {
  let book = openBook(day);
  const rulings: Ruling[] = [];
  let c = 0;
  for (let i = 1; i <= EXPIRY.checks.length && !book.closed; i++) {
    if (c >= calls.length) break;
    rulings.push(playbook(day, book, i));
    book = act(day, book, i, calls[c++]);
  }
  return { book, rulings, pnl: markBook(day, book, EXPIRY.checks.length + 1).pnl };
}

/** The playbook's own calls for a day, and where they leave you. */
export function playbookPath(day: Day): { calls: Action[]; pnl: number } {
  let book = openBook(day);
  const calls: Action[] = [];
  for (let i = 1; i <= EXPIRY.checks.length && !book.closed; i++) {
    const a = playbook(day, book, i).ok[0];
    calls.push(a);
    book = act(day, book, i, a);
  }
  return { calls, pnl: markBook(day, book, EXPIRY.checks.length + 1).pnl };
}

/** P&L if you sold at 9:15 and never touched it. */
export const heldPnl = (day: Day) => markBook(day, openBook(day), EXPIRY.checks.length + 1).pnl;

export interface ExpiryScore {
  right: number;
  total: number;
  /** Calls the playbook insists on, and how many you made. */
  mustTaken: number;
  musts: number;
  pnl: number;
  passed: boolean;
}

export function scoreExpiry(calls: Call[], pnls: number[]): ExpiryScore {
  const right = calls.filter((c) => c.right).length;
  const musts = calls.filter((c) => c.ruling.must).length;
  const mustTaken = calls.filter((c) => c.ruling.must && c.right).length;
  const total = calls.length;
  return {
    right,
    total,
    mustTaken,
    musts,
    pnl: pnls.reduce((a, b) => a + b, 0),
    passed: total > 0 && right >= Math.ceil(EXPIRY.passShare * total) && mustTaken === musts,
  };
}

export const DAY_NAME: Record<DayKind, string> = {
  pin: 'A quiet day that pins',
  trend: 'A day that trends',
  event: 'RBI policy day',
};
