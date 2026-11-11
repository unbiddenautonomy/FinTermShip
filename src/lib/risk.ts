/**
 * Risk desk: approve or reject trade requests against the book's limits.
 *
 * A long-short equity book with a Nifty futures hedge sits close to its
 * limits. Eight requests come in from the desk: add to a winner, a new idea, a
 * basket, more hedge, less hedge, a pair, a profit-take, a short. Four of them
 * break exactly one limit and four break none. Approve or reject each, and when
 * you reject, name the limit it breaks.
 *
 * The limits are the ones a risk manager actually watches:
 * - gross exposure: every position added up, long or short;
 * - net exposure: longs minus shorts, including the futures;
 * - single stock: no one name bigger than the cap;
 * - VaR: one-day 99% value at risk, from a one-factor model;
 * - margin: shorts and futures need margin, the longs are paid in cash.
 *
 * The learner works out gross, net, the biggest name and margin from the
 * book; VaR comes from the risk system, as it would on a real desk, because it
 * depends on how the positions move together and doesn't simply add up.
 *
 * The book always follows the right calls: a breach that is approved is
 * unwound by risk at the end of the day, and a clean trade that is rejected is
 * signed off by the head of desk. So every game is the same eight requests
 * whatever the learner does, and the score is about the calls alone.
 */
import { shuffle, type Rng } from './questions';

export const RISK = {
  requests: 8,
  breaches: 4,
  limits: { gross: 750, netLow: -50, netHigh: 200, name: 40, var: 6.5, margin: 55 },
  /** Requests stay at least this far from every line, so no call is a coin toss. */
  slack: { gross: 5, net: 5, name: 2, var: 0.2, margin: 2 } as Record<Limit, number>,
  shortMargin: 0.2,
  futuresMargin: 0.12,
  marketVol: 0.011,
  z: 2.33,
  /** Pass with at most this many points dropped, and no breach approved. */
  dropAllowed: 2,
};

export type Limit = 'gross' | 'net' | 'name' | 'var' | 'margin';
export const LIMITS: Limit[] = ['gross', 'net', 'name', 'var', 'margin'];
export const LIMIT_LABEL: Record<Limit, string> = {
  gross: 'Gross exposure',
  net: 'Net exposure',
  name: 'Single stock',
  var: 'VaR',
  margin: 'Margin',
};
export const FUTURES = 'Nifty futures';

/** Sectors and their betas to Nifty. Each name is its sector's beta ± 0.1. */
const SECTORS: [string, number][] = [
  ['Bank', 1.15],
  ['IT', 0.9],
  ['Auto', 1.05],
  ['Pharma', 0.7],
  ['FMCG', 0.6],
  ['Metal', 1.4],
  ['Energy', 1.0],
  ['Cement', 0.95],
];

export interface Stock {
  id: string;
  beta: number;
  /** Daily idiosyncratic vol, as a fraction. */
  vol: number;
}
/** Positions in ₹ crore by name; negative is short. The futures hedge sits under FUTURES. */
export type Book = Record<string, number>;
export interface Trade {
  name: string;
  amount: number;
}
export type RequestKind = 'add' | 'new' | 'basket' | 'hedge' | 'unhedge' | 'pair' | 'cut' | 'short';
const KINDS: RequestKind[] = ['add', 'new', 'basket', 'hedge', 'unhedge', 'pair', 'cut', 'short'];
export interface Request {
  kind: RequestKind;
  trades: Trade[];
  text: string;
}
export interface Metrics {
  gross: number;
  net: number;
  /** The biggest single stock, long or short, and which one it is. */
  name: number;
  nameId: string;
  var: number;
  margin: number;
}
export interface RiskCase {
  request: Request;
  /** The book before the request. */
  book: Book;
  before: Metrics;
  after: Metrics;
  breaches: Limit[];
}
export interface RiskGame {
  stocks: Record<string, Stock>;
  cases: RiskCase[];
}

const L = RISK.limits;
const r1 = (x: number) => Math.round(x * 10) / 10;
const between = (lo: number, hi: number, rng: Rng) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T>(xs: T[], rng: Rng): T => xs[Math.floor(rng() * xs.length)];
/** A multiple of 5 from lo to hi, or 0 when there is none. */
function fives(lo: number, hi: number, rng: Rng): number {
  const a = Math.ceil(lo / 5);
  const b = Math.floor(hi / 5);
  return b < a ? 0 : 5 * between(a, b, rng);
}

/** ₹ crore, whole or to one decimal. */
export function crore(x: number, sign = false): string {
  const r = r1(x);
  const s = Number.isInteger(r) ? Math.abs(r).toString() : Math.abs(r).toFixed(1);
  const lead = r < 0 ? '−' : sign && r > 0 ? '+' : '';
  return `${lead}₹${s} cr`;
}

export function metrics(book: Book, stocks: Record<string, Stock>): Metrics {
  let gross = 0;
  let net = 0;
  let name = 0;
  let nameId = '';
  let shorts = 0;
  let market = 0;
  let idio = 0;
  for (const [id, x] of Object.entries(book)) {
    if (x === 0) continue;
    gross += Math.abs(x);
    net += x;
    if (id === FUTURES) {
      market += x;
      continue;
    }
    if (Math.abs(x) > name) {
      name = Math.abs(x);
      nameId = id;
    }
    if (x < 0) shorts -= x;
    const s = stocks[id];
    market += s.beta * x;
    idio += (x * s.vol) ** 2;
  }
  const futures = Math.abs(book[FUTURES] ?? 0);
  return {
    gross,
    net,
    name,
    nameId,
    margin: r1(RISK.shortMargin * shorts + RISK.futuresMargin * futures),
    var: r1(RISK.z * Math.sqrt((market * RISK.marketVol) ** 2 + idio)),
  };
}

export function applyTrades(book: Book, trades: Trade[]): Book {
  const out = { ...book };
  for (const t of trades) {
    const x = (out[t.name] ?? 0) + t.amount;
    if (x === 0) delete out[t.name];
    else out[t.name] = x;
  }
  return out;
}

/** How far inside a limit the book is: negative when past it. */
export function room(m: Metrics, limit: Limit): number {
  switch (limit) {
    case 'gross':
      return L.gross - m.gross;
    case 'net':
      return Math.min(L.netHigh - m.net, m.net - L.netLow);
    case 'name':
      return L.name - m.name;
    case 'var':
      return r1(L.var - m.var);
    case 'margin':
      return r1(L.margin - m.margin);
  }
}

export const breachesOf = (m: Metrics): Limit[] => LIMITS.filter((l) => room(m, l) < 0);

/**
 * Clear of every line by the slack: past `target` (if any) and inside all the
 * others; or, when `loose`, past the target and clearly past or clearly inside
 * each of the others.
 */
function clearOf(m: Metrics, target: Limit | null, loose = false): boolean {
  const eps = 1e-9;
  return LIMITS.every((l) => {
    const past = room(m, l) <= -RISK.slack[l] + eps;
    const inside = room(m, l) >= RISK.slack[l] - eps;
    if (l === target) return past;
    return loose && target ? past || inside : inside;
  });
}

function newStocks(rng: Rng): Record<string, Stock> {
  const out: Record<string, Stock> = {};
  for (const [sector, beta] of SECTORS) {
    for (const letter of ['A', 'B', 'C', 'D']) {
      const id = `${sector} ${letter}`;
      out[id] = { id, beta: Math.round((beta + 0.2 * rng() - 0.1) * 100) / 100, vol: 0.012 + 0.012 * rng() };
    }
  }
  return out;
}

/** A starting book close to its limits but inside all of them. */
function startBook(stocks: Record<string, Stock>, rng: Rng): Book | null {
  const ids = Object.keys(stocks);
  for (let tries = 0; tries < 1500; tries++) {
    const order = shuffle(ids, rng);
    const book: Book = {};
    for (const id of order.slice(0, 13)) book[id] = between(24, 37, rng);
    for (const id of order.slice(13, 21)) book[id] = -between(12, 30, rng);
    book[FUTURES] = -5 * between(14, 30, rng);
    const m = metrics(book, stocks);
    if (m.gross < 0.8 * L.gross || m.gross > 0.95 * L.gross) continue;
    if (m.net < 10 || m.net > 160) continue;
    if (m.var < 0.75 * L.var || m.var > 0.92 * L.var) continue;
    if (m.margin < 0.72 * L.margin || m.margin > 0.92 * L.margin) continue;
    if (!clearOf(m, null)) continue;
    return book;
  }
  return null;
}

/** One request of a kind against the book, or null if the book has nothing for it. */
export function candidate(kind: RequestKind, book: Book, stocks: Record<string, Stock>, rng: Rng): Request | null {
  const names = Object.keys(stocks);
  const longs = names.filter((n) => (book[n] ?? 0) > 0);
  const shorts = names.filter((n) => (book[n] ?? 0) < 0);
  const free = names.filter((n) => !book[n]);
  const futures = Math.abs(book[FUTURES] ?? 0);
  switch (kind) {
    case 'add': {
      if (!longs.length) return null;
      const n = pick(longs, rng);
      const a = fives(5, 30, rng);
      return { kind, trades: [{ name: n, amount: a }], text: `The PM wants to add to a winner: buy ${crore(a)} more of ${n}.` };
    }
    case 'new': {
      if (!free.length) return null;
      const n = pick(free, rng);
      const a = fives(10, 50, rng);
      return { kind, trades: [{ name: n, amount: a }], text: `A new idea from the analyst: buy ${crore(a)} of ${n}.` };
    }
    case 'basket': {
      if (free.length < 3) return null;
      const ns = shuffle(free, rng).slice(0, 3);
      const a = fives(10, 30, rng);
      return {
        kind,
        trades: ns.map((n) => ({ name: n, amount: a })),
        text: `A sector call: buy a basket of ${crore(a)} each in ${ns[0]}, ${ns[1]} and ${ns[2]}.`,
      };
    }
    case 'hedge': {
      const a = fives(20, 150, rng);
      return { kind, trades: [{ name: FUTURES, amount: -a }], text: `The PM is nervous about the market: sell ${crore(a)} more Nifty futures as a hedge.` };
    }
    case 'unhedge': {
      const a = fives(10, Math.min(futures - 10, 120), rng);
      if (!a) return null;
      return { kind, trades: [{ name: FUTURES, amount: a }], text: `The PM is turning bullish: buy back ${crore(a)} of the Nifty futures hedge.` };
    }
    case 'pair': {
      const buy = pick([...free, ...longs], rng);
      const sells = [...free, ...shorts].filter((n) => n !== buy);
      if (!sells.length) return null;
      const sell = pick(sells, rng);
      const a = fives(10, 45, rng);
      return {
        kind,
        trades: [
          { name: buy, amount: a },
          { name: sell, amount: -a },
        ],
        text: `A pair trade: buy ${crore(a)} of ${buy} and short ${crore(a)} of ${sell}.`,
      };
    }
    case 'cut': {
      if (!longs.length) return null;
      const n = pick(longs, rng);
      const a = fives(5, book[n] - 5, rng);
      if (!a) return null;
      return { kind, trades: [{ name: n, amount: -a }], text: `Take some profit: sell ${crore(a)} of ${n}.` };
    }
    case 'short': {
      const pool = [...free, ...shorts];
      if (!pool.length) return null;
      const n = pick(pool, rng);
      const a = fives(10, 40, rng);
      const text = book[n] ? `The analyst wants a bigger short: short ${crore(a)} more of ${n}.` : `The analyst thinks it's expensive: short ${crore(a)} of ${n}.`;
      return { kind, trades: [{ name: n, amount: -a }], text };
    }
  }
}

/**
 * A request that breaks `target` (or nothing, for null), clear of every line.
 * It looks for one that breaks only the target first; some limits move
 * together (taking off hedge lifts net and VaR at once), so it then settles
 * for one that breaks the target and another limit.
 */
function findRequest(target: Limit | null, book: Book, stocks: Record<string, Stock>, rng: Rng, avoid: RequestKind | null): RiskCase | null {
  const before = metrics(book, stocks);
  for (let tries = 0; tries < 1500; tries++) {
    const kind = pick(KINDS, rng);
    if (kind === avoid && tries < 500) continue;
    const request = candidate(kind, book, stocks, rng);
    if (!request) continue;
    const after = metrics(applyTrades(book, request.trades), stocks);
    const breaches = breachesOf(after);
    if (!clearOf(after, target, tries >= 1000) || breaches.length > 2) continue;
    return { request, book, before, after, breaches };
  }
  return null;
}

function tryGame(rng: Rng): RiskGame | null {
  const stocks = newStocks(rng);
  let book = startBook(stocks, rng);
  if (!book) return null;
  const targets = shuffle(LIMITS, rng).slice(0, RISK.breaches);
  const plan: (Limit | null)[] = shuffle([...targets, ...Array<null>(RISK.requests - RISK.breaches).fill(null)], rng);
  const cases: RiskCase[] = [];
  for (const target of plan) {
    const c = findRequest(target, book, stocks, rng, cases.length ? cases[cases.length - 1].request.kind : null);
    if (!c) return null;
    cases.push(c);
    if (!c.breaches.length) book = applyTrades(book, c.request.trades);
  }
  return { stocks, cases };
}

export function newRiskGame(rng: Rng): RiskGame {
  for (let tries = 0; tries < 100; tries++) {
    const g = tryGame(rng);
    if (g) return g;
  }
  throw new Error('Could not build a risk desk game');
}

export type Decision = 'approve' | 'reject';
export interface Answer {
  index: number;
  decision: Decision;
  limit: Limit | null;
  /** The approve-or-reject call was right. */
  right: boolean;
  /** A breach rejected and its limit named. */
  named: boolean;
  points: number;
}

export function judge(c: RiskCase, index: number, decision: Decision, limit: Limit | null): Answer {
  const breach = c.breaches.length > 0;
  const right = (decision === 'reject') === breach;
  const named = right && breach && limit !== null && c.breaches.includes(limit);
  return { index, decision, limit, right, named, points: (right ? 1 : 0) + (named ? 1 : 0) };
}

export const maxPoints = (cases: RiskCase[]) => cases.length + cases.filter((c) => c.breaches.length).length;

export interface RiskScore {
  points: number;
  max: number;
  right: number;
  named: number;
  breaches: number;
  approvedBreaches: number;
  passed: boolean;
}

export function scoreRisk(cases: RiskCase[], answers: Answer[]): RiskScore {
  const max = maxPoints(cases);
  const points = answers.reduce((a, b) => a + b.points, 0);
  const approvedBreaches = answers.filter((a) => a.decision === 'approve' && cases[a.index].breaches.length > 0).length;
  return {
    points,
    max,
    right: answers.filter((a) => a.right).length,
    named: answers.filter((a) => a.named).length,
    breaches: cases.filter((c) => c.breaches.length).length,
    approvedBreaches,
    passed: points >= max - RISK.dropAllowed && approvedBreaches === 0,
  };
}

const KIND_NOTE: Partial<Record<RequestKind, string>> = {
  hedge: 'A hedge cuts net and VaR, but adds to gross and margin.',
  unhedge: 'Taking off hedge cuts gross and margin, but adds market risk.',
  pair: 'A pair adds both legs to gross but leaves net where it was.',
  cut: 'Selling a long cuts gross, net and VaR together.',
  basket: 'A basket spreads the money across names, so no one stock gets big.',
};

const WHY: Record<Limit, (c: RiskCase) => string> = {
  gross: (c) =>
    `Gross would go from ${crore(c.before.gross)} to ${crore(c.after.gross)}, past the ${crore(L.gross)} limit. Gross counts every position, long or short${c.request.kind === 'hedge' ? ', so even a hedge adds to it' : c.request.kind === 'pair' ? ', so a pair adds both legs' : ''}.`,
  net: (c) =>
    c.after.net > L.netHigh
      ? `Net would go from ${crore(c.before.net, true)} to ${crore(c.after.net, true)}, past the ${crore(L.netHigh, true)} limit: too big a bet on the market going up.`
      : `Net would go from ${crore(c.before.net, true)} to ${crore(c.after.net, true)}, below the ${crore(L.netLow, true)} limit: the book would turn into a bet on the market falling.`,
  name: (c) => `${c.after.nameId} would be ${crore(c.after.name)}, past the ${crore(L.name)} single-stock limit. One name's bad news shouldn't be able to sink the book.`,
  var: (c) =>
    `VaR would go from ${crore(c.before.var)} to ${crore(c.after.var)}, past ${crore(L.var)}. ${
      c.request.kind === 'unhedge'
        ? 'Taking off hedge shrinks gross, but leaves the book more exposed to the market.'
        : "VaR isn't additive: it depends on how the positions move together, which is why the risk system works it out."
    }`,
  margin: (c) => `Margin would go from ${crore(c.before.margin)} to ${crore(c.after.margin)}, past the ${crore(L.margin)} limit. Shorts and futures need margin; the longs here are paid in cash.`,
};

/** Why the request breaks a limit, or why it's fine. */
export function explain(c: RiskCase): string {
  if (c.breaches.length) return c.breaches.map((l) => WHY[l](c)).join(' ');
  const a = c.after;
  const note = KIND_NOTE[c.request.kind];
  return `Inside every limit: gross ${crore(a.gross)}, net ${crore(a.net, true)}, the biggest name ${crore(a.name)}, margin ${crore(a.margin)} and VaR ${crore(a.var)}.${note ? ` ${note}` : ''}`;
}

/** The current position in a name, in words. */
export function positionText(book: Book, name: string): string {
  const x = book[name] ?? 0;
  if (!x) return 'none';
  return `${x > 0 ? 'long' : 'short'} ${crore(Math.abs(x))}`;
}
