/**
 * Recall Exchange: every met term listed under a ticker, priced at its strength.
 * The price is read from the shared record, never stored; only the daily index is kept, for the chart.
 */
import tickerData from '../../data/modes/tickers.json';
import { categoryOfTerm, isCore, termById } from '../content';
import { addDays } from '../dates';
import { isDueOn, isKnown } from '../scheduler';
import type { Progress } from '../types';
import { kpis, modeRecord, strength } from './knowledge';

export const tickers = tickerData as Record<string, string>;

export interface Quote {
  termId: string;
  ticker: string;
  sector: string;
  price: number;
  /** Change since yesterday, in strength points. */
  change: number;
  falling: boolean;
  blueChip: boolean;
}

export function quote(p: Progress, termId: string, today: string): Quote | null {
  const s = p.terms[termId];
  if (!s || !termById.has(termId)) return null;
  const core = isCore(termId);
  const price = strength(s, today, core);
  const before = strength(s, addDays(today, -1), core);
  return {
    termId,
    ticker: tickers[termId],
    sector: categoryOfTerm.get(termId)!.id,
    price,
    change: price - before,
    falling: isDueOn(s, today),
    blueChip: isKnown(s),
  };
}

/** The watchlist: everything listed, biggest fallers first, then the weakest prices. */
export function watchlist(p: Progress, today: string): Quote[] {
  return Object.keys(p.terms)
    .map((id) => quote(p, id, today))
    .filter((q): q is Quote => !!q)
    .sort((a, b) => Number(b.falling) - Number(a.falling) || a.change - b.change || a.price - b.price);
}

/** Save today's index (the shared Strength KPI) once a day and lift the all-time high. */
export function snapshotIndex(p: Progress, today: string): Progress {
  const value = kpis(p, today).strength;
  const r = modeRecord(p, 'exchange');
  const history = { ...(r.history ?? {}), [today]: value };
  return { ...p, modes: { ...(p.modes ?? {}), exchange: { ...r, history, indexHigh: Math.max(r.indexHigh ?? 0, value) } } };
}
