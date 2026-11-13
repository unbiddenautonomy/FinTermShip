/**
 * Every term card, built from the full syllabus files. The Worker serves cards
 * from this, and the tests and `npm run dev` load it whole. The app's
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
import talk from '../data/talk.json';
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
