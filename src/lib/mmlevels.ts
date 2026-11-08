/**
 * Make a market, levels 2 to 5. Each level keeps the game from level 1
 * (quote a bid and an ask, one trader a turn, some traders know what is
 * coming) and adds one thing desks deal with every day:
 *
 * 2. Cards: the total is five cards from a deck of 1 to 10, dealt without
 *    putting them back, so each card shown changes what the hidden ones are
 *    worth.
 * 3. A headline: one turn ends with news that moves the total by 3 or 4
 *    points. Fast traders know it first, so you widen before it and re-centre
 *    after it.
 * 4. Big orders: traders deal 1 to 3 lots and the ones who know the next die
 *    always deal 3. Size is information, and the position swings faster.
 * 5. A rival: another market maker quotes fair value ± 1 every turn. Traders
 *    deal at the best price, so you only trade when you are at it, and if you
 *    are better on both sides, every trader who knows something deals with you.
 *
 * All randomness is drawn up front from the seed, so a game is fixed by its
 * seed and the player's quotes.
 */
import { noiseTradeChance, type Quote } from './market';
import type { Rng } from './questions';

export type LevelNo = 2 | 3 | 4 | 5;

export interface LevelSpec {
  n: LevelNo;
  /** What this level adds, as a short name. */
  name: string;
  source: 'dice' | 'cards';
  /** Dice or cards in the total. */
  count: number;
  turns: number;
  /** One die or card is shown after each of these turns; the rest at the end. */
  revealAfter: number[];
  informedShare: number;
  limit: number;
  /** Level 4: risk wants you within this many lots at the end of every turn. */
  riskLimit?: number;
  /** Pass marks: mid within `midTolerance` of fair value on `midTurnsNeeded` turns, spread no wider than `maxWidth`, end within `flatAtEnd` lots. */
  midTolerance: number;
  midTurnsNeeded: number;
  maxWidth: number;
  flatAtEnd: number;
}

/** A trader who knows what is coming only deals when the price is at least this good for them. */
export const INFORMED_EDGE = 0.5;
export const STEP = 0.5;
/** Cards 1 to 10, one of each. */
export const DECK = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const DECK_TOTAL = 55;

/** Level 3: the headline turn, how many fast traders deal on it, and how wide to be. */
export const HEADLINE = {
  turns: [2, 4, 5, 7, 8],
  shifts: [3, 4],
  informedShare: 0.8,
  minWidth: 6,
};

/** Level 4: lots a trader deals. Traders who know the next die always deal the most. */
export const SIZES = { informed: 3, noise: [1, 2] };

/** Level 5: the rival quotes fair value this far either side, and never leans. */
export const RIVAL = { half: 1 };

export const LEVELS: Record<LevelNo, LevelSpec> = {
  2: {
    n: 2,
    name: 'Cards',
    source: 'cards',
    count: 5,
    turns: 10,
    revealAfter: [2, 4, 6, 8],
    informedShare: 0.35,
    limit: 5,
    midTolerance: 1,
    midTurnsNeeded: 8,
    maxWidth: 4,
    flatAtEnd: 2,
  },
  3: {
    n: 3,
    name: 'A headline',
    source: 'dice',
    count: 3,
    turns: 9,
    revealAfter: [3, 6],
    informedShare: 0.35,
    limit: 5,
    midTolerance: 1,
    midTurnsNeeded: 7,
    maxWidth: 3,
    flatAtEnd: 2,
  },
  4: {
    n: 4,
    name: 'Big orders',
    source: 'dice',
    count: 3,
    turns: 9,
    revealAfter: [3, 6],
    informedShare: 0.35,
    limit: 6,
    riskLimit: 4,
    midTolerance: 2,
    midTurnsNeeded: 7,
    maxWidth: 3,
    flatAtEnd: 3,
  },
  5: {
    n: 5,
    name: 'A rival',
    source: 'dice',
    count: 3,
    turns: 9,
    revealAfter: [3, 6],
    informedShare: 0.35,
    limit: 5,
    midTolerance: 1,
    midTurnsNeeded: 7,
    maxWidth: 3,
    flatAtEnd: 1,
  },
};

export interface LevelGame {
  level: LevelNo;
  /** Dice or cards in the order they are shown. */
  items: number[];
  /** Per turn: [is the trader informed, does a noise trader trade, which way, lot size, who wins a tie]. */
  draws: [number, number, number, number, number][];
  /** Level 3 only: the turn that ends with the headline, and how far it moves the total. */
  headline: { turn: number; shift: number } | null;
}

export function newLevelGame(level: LevelNo, rng: Rng): LevelGame {
  const spec = LEVELS[level];
  let items: number[];
  if (spec.source === 'dice') items = Array.from({ length: spec.count }, () => 1 + Math.floor(rng() * 6));
  else {
    const deck = [...DECK];
    items = [];
    for (let i = 0; i < spec.count; i++) items.push(deck.splice(Math.floor(rng() * deck.length), 1)[0]);
  }
  const draws = Array.from({ length: spec.turns }, () => [rng(), rng(), rng(), rng(), rng()] as [number, number, number, number, number]);
  let headline: LevelGame['headline'] = null;
  if (level === 3) {
    const turn = HEADLINE.turns[Math.floor(rng() * HEADLINE.turns.length)];
    const size = HEADLINE.shifts[Math.floor(rng() * HEADLINE.shifts.length)];
    headline = { turn, shift: rng() < 0.5 ? size : -size };
  }
  return { level, items, draws, headline };
}

/** Dice or cards already shown when the player quotes on this turn (turns count from 1). */
export function shownAt(level: LevelNo, turn: number): number {
  return LEVELS[level].revealAfter.filter((t) => t < turn).length;
}

/** Whether the headline is out by this turn, so its move is in fair value. */
export const headlineOut = (game: LevelGame, turn: number) => !!game.headline && game.headline.turn < turn;

/** Expected total with `shown` items known: for cards, each hidden card is worth the average of the cards left in the deck. */
export function expectedTotal(game: LevelGame, shown: number, headlineKnown: boolean): number {
  const spec = LEVELS[game.level];
  const seen = game.items.slice(0, shown).reduce((a, b) => a + b, 0);
  const hidden = spec.count - shown;
  const each = spec.source === 'dice' ? 3.5 : (DECK_TOTAL - seen) / (DECK.length - shown);
  return seen + hidden * each + (headlineKnown && game.headline ? game.headline.shift : 0);
}

/** Fair value when quoting on this turn. */
export const levelFair = (game: LevelGame, turn: number) => expectedTotal(game, shownAt(game.level, turn), headlineOut(game, turn));

/** The final total everything settles at. */
export const levelTotal = (game: LevelGame) => game.items.reduce((a, b) => a + b, 0) + (game.headline?.shift ?? 0);

/** True on the turn that ends with the headline. */
export const isHeadlineTurn = (game: LevelGame, turn: number) => game.headline?.turn === turn;

/** What a trader who knows what is coming thinks the total is worth: the next die or card, or on the headline turn, the headline. */
export function informedView(game: LevelGame, turn: number): number {
  if (isHeadlineTurn(game, turn)) return levelFair(game, turn) + game.headline!.shift;
  const shown = shownAt(game.level, turn);
  if (shown >= LEVELS[game.level].count) return levelFair(game, turn);
  return expectedTotal(game, shown + 1, headlineOut(game, turn));
}

const down = (x: number) => Math.floor(x / STEP + 1e-9) * STEP;
const up = (x: number) => Math.ceil(x / STEP - 1e-9) * STEP;

/** The rival's quote: fair value ± 1, on the half-point grid, never leaning. */
export function rivalQuote(fair: number): Quote {
  return { bid: down(fair - RIVAL.half), ask: up(fair + RIVAL.half) };
}

export interface LevelFill {
  side: 'bought' | 'sold';
  price: number;
  lots: number;
  informed: boolean;
}

export interface LevelTurn {
  turn: number;
  fair: number;
  quote: Quote;
  /** Level 5: the rival's quote this turn. */
  rival: Quote | null;
  fill: LevelFill | null;
  /** A trader dealt with the rival instead of with you. */
  rivalFill: LevelFill | null;
  /** A trader wanted to deal with you, but it would have taken you past your limit. */
  blocked: boolean;
  position: number;
}

/** What happens on one turn, given the quote and the position going in. */
export function playLevelTurn(game: LevelGame, turn: number, quote: Quote, position: number): LevelTurn {
  const spec = LEVELS[game.level];
  const fair = levelFair(game, turn);
  const [who, chance, way, size, tie] = game.draws[turn - 1];
  const share = isHeadlineTurn(game, turn) ? HEADLINE.informedShare : spec.informedShare;
  const informed = who < share;
  const rival = game.level === 5 ? rivalQuote(fair) : null;
  const bestAsk = rival ? Math.min(quote.ask, rival.ask) : quote.ask;
  const bestBid = rival ? Math.max(quote.bid, rival.bid) : quote.bid;

  let want: 'buy' | 'sell' | null = null;
  if (informed) {
    const view = informedView(game, turn);
    if (view >= bestAsk + INFORMED_EDGE) want = 'buy';
    else if (view <= bestBid - INFORMED_EDGE) want = 'sell';
  } else if (chance < noiseTradeChance(bestAsk - bestBid)) {
    // Prices below fair value attract buyers, prices above it attract sellers.
    const mid = (bestBid + bestAsk) / 2;
    const buyChance = Math.min(0.9, Math.max(0.1, 0.5 + 0.3 * (fair - mid)));
    want = way < buyChance ? 'buy' : 'sell';
  }
  const lots = game.level === 4 ? (informed ? SIZES.informed : SIZES.noise[size < 0.5 ? 0 : 1]) : 1;

  let fill: LevelFill | null = null;
  let rivalFill: LevelFill | null = null;
  let blocked = false;
  if (want) {
    // The trader buys at the best ask, or sells at the best bid. At the same price, a coin decides who gets it.
    const mine = want === 'buy' ? quote.ask === bestAsk : quote.bid === bestBid;
    const theirs = !!rival && (want === 'buy' ? rival.ask === bestAsk : rival.bid === bestBid);
    const toMe = mine && (!theirs || tie < 0.5);
    const side = want === 'buy' ? 'sold' : 'bought';
    const price = want === 'buy' ? bestAsk : bestBid;
    if (toMe) {
      const next = position + (side === 'bought' ? lots : -lots);
      if (Math.abs(next) > spec.limit) blocked = true;
      else fill = { side, price, lots, informed };
    } else if (theirs) rivalFill = { side, price, lots, informed };
  }
  const next = position + (fill ? (fill.side === 'bought' ? fill.lots : -fill.lots) : 0);
  return { turn, fair, quote, rival, fill, rivalFill, blocked, position: next };
}

export type CheckId = 'mid' | 'width' | 'headline' | 'inventory' | 'best' | 'inside' | 'flat';

export interface LevelScore {
  total: number;
  position: number;
  pnl: number;
  /** Level 5: what the rival made on the trades it won, settled the same way. */
  rivalPnl: number;
  midTurns: number;
  /** Turns the mid check counts: all of them, or all but the headline turn. */
  midOf: number;
  widest: number;
  /** Level 3: the spread on the headline turn. */
  headlineWidth: number | null;
  /** The most lots held at the end of any turn. */
  maxPosition: number;
  /** Level 5: turns you were at the best price on at least one side. */
  bestTurns: number;
  /** Level 5: turns you quoted inside the rival on both sides at once. */
  insideTurns: number[];
  checks: Partial<Record<CheckId, boolean>>;
  passed: boolean;
}

/** The checks each level is scored on, in the order the review lists them. */
export function levelChecks(level: LevelNo): CheckId[] {
  if (level === 3) return ['mid', 'width', 'headline', 'flat'];
  if (level === 4) return ['mid', 'width', 'inventory', 'flat'];
  if (level === 5) return ['mid', 'best', 'inside', 'flat'];
  return ['mid', 'width', 'flat'];
}

/** Level 5: be at the best price on at least one side on this many turns. */
export const BEST_TURNS_NEEDED = 8;

export function scoreLevel(game: LevelGame, turns: LevelTurn[]): LevelScore {
  const spec = LEVELS[game.level];
  const total = levelTotal(game);
  const settle = (fills: (LevelFill | null)[]) => {
    let cash = 0;
    let pos = 0;
    for (const f of fills) {
      if (!f) continue;
      cash += (f.side === 'sold' ? 1 : -1) * f.price * f.lots;
      pos += (f.side === 'bought' ? 1 : -1) * f.lots;
    }
    return cash + pos * total;
  };
  const position = turns.length ? turns[turns.length - 1].position : 0;
  const normal = turns.filter((t) => !isHeadlineTurn(game, t.turn));
  const midTurns = normal.filter((t) => Math.abs((t.quote.bid + t.quote.ask) / 2 - t.fair) <= spec.midTolerance).length;
  const widest = Math.max(0, ...normal.map((t) => t.quote.ask - t.quote.bid));
  const ht = game.headline ? turns.find((t) => t.turn === game.headline!.turn) : undefined;
  const headlineWidth = ht ? ht.quote.ask - ht.quote.bid : null;
  const bestTurns = turns.filter((t) => t.rival && (t.quote.bid >= t.rival.bid || t.quote.ask <= t.rival.ask)).length;
  const insideTurns = turns.filter((t) => t.rival && t.quote.bid > t.rival.bid && t.quote.ask < t.rival.ask).map((t) => t.turn);
  const maxPosition = Math.max(0, ...turns.map((t) => Math.abs(t.position)));
  const all: Record<CheckId, boolean> = {
    mid: midTurns >= spec.midTurnsNeeded,
    width: widest <= spec.maxWidth,
    headline: headlineWidth !== null && headlineWidth >= HEADLINE.minWidth,
    inventory: maxPosition <= (spec.riskLimit ?? spec.limit),
    best: bestTurns >= BEST_TURNS_NEEDED,
    inside: insideTurns.length === 0,
    flat: Math.abs(position) <= spec.flatAtEnd,
  };
  const ids = levelChecks(game.level);
  const checks = Object.fromEntries(ids.map((id) => [id, all[id]])) as Partial<Record<CheckId, boolean>>;
  return {
    total,
    position,
    pnl: settle(turns.map((t) => t.fill)),
    rivalPnl: settle(turns.map((t) => t.rivalFill)),
    midTurns,
    midOf: normal.length,
    widest,
    headlineWidth,
    maxPosition,
    bestTurns,
    insideTurns,
    checks,
    passed: turns.length === spec.turns && ids.every((id) => all[id]),
  };
}
