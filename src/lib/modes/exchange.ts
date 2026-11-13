/**
 * Recall Exchange: every met term listed under a ticker, priced at its strength.
 * Prices are read from the shared record, never stored as truth. The Exchange keeps only what a
 * market needs to show movement: the index once a day for the chart, and every price at the
 * latest visit (and the latest visit on an earlier day), so each stock's change is real.
 */
import tickerData from '../../data/modes/tickers.json';
import { categoryOfTerm, isCore, termById } from '../content';
import { isDueOn, isKnown } from '../scheduler';
import type { Progress } from '../types';
import { modeRecord, openTermIds, strength, type Marks } from './knowledge';

export const tickers = tickerData as Record<string, string>;

/** The index runs to this when every open term is held at full price. */
export const INDEX_FULL = 1000;

export interface Quote {
  termId: string;
  ticker: string;
  sector: string;
  price: number;
  /** Change since the latest visit on an earlier day, in price points. 0 when there is no earlier visit. */
  change: number;
  /** Listed since that visit. */
  fresh: boolean;
  falling: boolean;
  blueChip: boolean;
}

export function priceOf(p: Progress, termId: string, today: string): number {
  return strength(p.terms[termId], today, isCore(termId));
}

/** The visit that today's changes are measured from: the latest one before today. */
export function baseline(p: Progress, today: string): Marks | undefined {
  const r = modeRecord(p, 'exchange');
  if (r.marks && r.marks.day < today) return r.marks;
  return r.prevMarks && r.prevMarks.day < today ? r.prevMarks : undefined;
}

export function quote(p: Progress, termId: string, today: string, base = baseline(p, today)): Quote | null {
  const s = p.terms[termId];
  if (!s || !termById.has(termId)) return null;
  const price = priceOf(p, termId, today);
  const before = base?.prices[termId];
  return {
    termId,
    ticker: tickers[termId],
    sector: categoryOfTerm.get(termId)!.id,
    price,
    change: base && before !== undefined ? price - before : 0,
    fresh: !!base && before === undefined,
    falling: isDueOn(s, today),
    blueChip: isKnown(s),
  };
}

/** The watchlist: everything listed, due terms first, then the biggest fallers, then the weakest prices. */
export function watchlist(p: Progress, today: string): Quote[] {
  const base = baseline(p, today);
  const open = new Set(openTermIds(p));
  return Object.keys(p.terms)
    .filter((id) => open.has(id))
    .map((id) => quote(p, id, today, base))
    .filter((q): q is Quote => !!q)
    .sort((a, b) => Number(b.falling) - Number(a.falling) || a.change - b.change || a.price - b.price);
}

/**
 * The index: the value of everything held, as a share of every open term at full price, out of
 * INDEX_FULL. Learning a term lists it and lifts the index; an overdue review lets it slip.
 * With a sector, only that area's terms count, against that area's size.
 */
export function marketIndex(p: Progress, today: string, sector?: string): number {
  let ids = openTermIds(p);
  if (sector) ids = ids.filter((id) => categoryOfTerm.get(id)?.id === sector);
  if (!ids.length) return 0;
  let value = 0;
  for (const id of ids) if (p.terms[id]) value += priceOf(p, id, today);
  return Math.round((value / (100 * ids.length)) * INDEX_FULL * 10) / 10;
}

function prices(p: Progress, today: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of openTermIds(p)) if (p.terms[id]) out[id] = priceOf(p, id, today);
  return out;
}

const same = (a: Record<string, number>, b: Record<string, number>) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

/** True when today's reading is already saved, so the screen needn't save again. */
export function snapshotCurrent(p: Progress, today: string): boolean {
  const r = modeRecord(p, 'exchange');
  return r.marks?.day === today && r.closes?.[today] === marketIndex(p, today) && same(r.marks.prices, prices(p, today));
}

/**
 * Save a reading: today's index close, the high, and every price. A reading from an earlier day
 * becomes the baseline that changes are measured from.
 */
export function snapshotIndex(p: Progress, today: string): Progress {
  const value = marketIndex(p, today);
  const r = modeRecord(p, 'exchange');
  const prevMarks = r.marks && r.marks.day < today ? r.marks : r.prevMarks;
  const out = {
    ...r,
    closes: { ...(r.closes ?? {}), [today]: value },
    top: Math.max(r.top ?? 0, value),
    marks: { day: today, prices: prices(p, today) },
    ...(prevMarks ? { prevMarks } : {}),
  };
  return { ...p, modes: { ...(p.modes ?? {}), exchange: out } };
}
