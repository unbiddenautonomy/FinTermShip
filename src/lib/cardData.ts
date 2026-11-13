/**
 * Every term card and pack (src/lib/packs.ts), built from the full syllabus
 * files. The Worker serves them from this, and the tests and `npm run dev`
 * load it whole. The app's
 * production build never includes it: the browser gets cards from the server,
 * a learner's worth at a time (scripts/check-bundle.mjs fails the build if any
 * of it slips in).
 */
import basics from '../data/terms/basics.json';
import india from '../data/terms/india.json';
import options from '../data/terms/options.json';
import quant from '../data/terms/quant.json';
import trading from '../data/terms/trading.json';
import desk from '../data/terms/desk.json';
import conditions from '../data/terms/conditions.json';
import micro from '../data/terms/micro.json';
import skills from '../data/terms/skills.json';
import instruments from '../data/terms/instruments.json';
import execution from '../data/terms/execution.json';
import macro from '../data/terms/macro.json';
import strategies from '../data/terms/strategies.json';
import systematic from '../data/terms/systematic.json';
import commodities from '../data/terms/commodities.json';
import credit from '../data/terms/credit.json';
import fundamentals from '../data/terms/fundamentals.json';
import claims from '../data/modes/claims.json';
import headlines from '../data/modes/headlines.json';
import boards from '../data/modes/finnections.json';
import talk from '../data/talk.json';
import cases from '../data/cases.json';
import meetings from '../data/meetings.json';
import fermi from '../data/fermi.json';
import backtests from '../data/backtests.json';
import type { Board, Headline } from './modes/rounds';
import { CARD_FIELDS, type Card, type Category, type TalkItem, type WrittenClaim } from './types';

/** The syllabus with every term in full. */
export const fullCategories: Category[] = (
  [basics, india, trading, options, instruments, quant, skills, desk, conditions, macro, micro, execution, commodities, credit, fundamentals, strategies, systematic] as Category[]
).sort((a, b) => a.order - b.order);

/** Every term's card, by term id. */
export function buildCards(): Map<string, Card> {
  const cards = new Map<string, Card>();
  for (const cat of fullCategories) {
    for (const t of cat.terms) {
      const card: Record<string, unknown> = {};
      for (const k of CARD_FIELDS) if (t[k] !== undefined) card[k] = t[k];
      cards.set(t.id, card as unknown as Card);
    }
  }
  for (const c of claims as WrittenClaim[]) {
    const card = cards.get(c.term);
    if (card) (card.claims ??= []).push(c);
  }
  for (const i of talk as TalkItem[]) {
    const card = cards.get(i.term);
    if (card) (card.talk ??= []).push(i);
  }
  return cards;
}

/**
 * Every pack, by id: each desk case as 'case:<unit id>', the meeting, Fermi and backtest games'
 * content, and the Headline Desk and Finnections content. Items that use a phase 3 term go in
 * a ':p3' pack of their own, given only once phase 3 is open.
 */
export function buildPacks(): Map<string, unknown> {
  const packs = new Map<string, unknown>();
  for (const [id, c] of Object.entries(cases)) packs.set(`case:${id}`, c);
  packs.set('meeting', meetings);
  packs.set('fermi', fermi);
  packs.set('backtest', backtests);
  const phase3 = new Set(fullCategories.filter((c) => c.phase === 3).flatMap((c) => c.terms.map((t) => t.id)));
  const split = <T,>(id: string, items: T[], terms: (x: T) => string[]) => {
    packs.set(id, items.filter((x) => !terms(x).some((t) => phase3.has(t))));
    packs.set(`${id}:p3`, items.filter((x) => terms(x).some((t) => phase3.has(t))));
  };
  split('headlines', headlines as Headline[], (h) => h.items.map((i) => i.term));
  split('finnections', boards as Board[], (b) => b.groups.flatMap((g) => g.terms));
  return packs;
}
