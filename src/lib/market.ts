/**
 * Make a market: a small market-making game.
 *
 * The hidden number is the total of three dice. Dice are shown one at a time,
 * after turns 3 and 6, and the last at the end. Each turn the player quotes a
 * bid (where they buy 1 lot) and an ask (where they sell 1 lot), and one trader
 * comes along. Some traders already know the next die; the rest trade for
 * their own reasons, more often when the spread is tight. At the end every
 * open lot is settled at the total.
 *
 * All randomness is drawn up front from the seed, so a game is fixed by its
 * seed and the player's quotes.
 */
import type { Rng } from './questions';

export const MM = {
  turns: 9,
  /** A die is shown after each of these turns; the last one at the end. */
  revealAfter: [3, 6],
  /** Chance that a trader already knows the next die. */
  informedShare: 0.35,
  /** An informed trader only trades when the price is at least this good for them. */
  informedEdge: 0.5,
  /** Most lots the player may be long or short. */
  limit: 5,
  /** Price steps for the quote. */
  step: 0.5,
  /** Pass marks. */
  midTolerance: 1,
  midTurnsNeeded: 7,
  maxWidth: 3,
  flatAtEnd: 2,
};

export interface Quote {
  bid: number;
  ask: number;
}

/** A trade from the player's side: they bought at their bid, or sold at their ask. */
export interface Fill {
  side: 'bought' | 'sold';
  price: number;
  informed: boolean;
}

export interface TurnResult {
  turn: number;
  fair: number;
  quote: Quote;
  fill: Fill | null;
  /** A trader wanted to deal but the player was at their limit. */
  blocked: boolean;
  /** Position after the turn. */
  position: number;
}

export interface MarketGame {
  dice: [number, number, number];
  /** Per turn: [is the trader informed, does a noise trader trade, which way]. */
  draws: [number, number, number][];
}

export function newMarketGame(rng: Rng): MarketGame {
  const die = () => 1 + Math.floor(rng() * 6);
  const dice: [number, number, number] = [die(), die(), die()];
  const draws = Array.from({ length: MM.turns }, () => [rng(), rng(), rng()] as [number, number, number]);
  return { dice, draws };
}

/** Dice already shown when the player quotes on this turn (turns count from 1). */
export function shownBefore(turn: number): number {
  return MM.revealAfter.filter((t) => t < turn).length;
}

/** Expected total given the dice shown: 3.5 for each hidden die. */
export function fairValue(game: MarketGame, turn: number): number {
  const shown = shownBefore(turn);
  return game.dice.slice(0, shown).reduce((a, b) => a + b, 0) + 3.5 * (3 - shown);
}

/** How likely a trader with no inside view is to deal, by spread width. */
export function noiseTradeChance(width: number): number {
  if (width <= 1) return 0.95;
  if (width <= 2) return 0.8;
  if (width <= 3) return 0.35;
  if (width <= 4) return 0.2;
  return 0.05;
}

export function validQuote(q: Quote): boolean {
  const onStep = (x: number) => Math.abs(x / MM.step - Math.round(x / MM.step)) < 1e-9;
  return q.ask > q.bid && q.bid >= 0 && q.ask <= 30 && onStep(q.bid) && onStep(q.ask);
}

/** What happens on one turn, given the quote and the position going in. */
export function playTurn(game: MarketGame, turn: number, quote: Quote, position: number): TurnResult {
  const fair = fairValue(game, turn);
  const [who, chance, way] = game.draws[turn - 1];
  const informed = who < MM.informedShare;
  let want: 'buy' | 'sell' | null = null;
  if (informed) {
    const view = fair + game.dice[shownBefore(turn)] - 3.5;
    if (view >= quote.ask + MM.informedEdge) want = 'buy';
    else if (view <= quote.bid - MM.informedEdge) want = 'sell';
  } else if (chance < noiseTradeChance(quote.ask - quote.bid)) {
    // Prices below fair value attract buyers, prices above it attract sellers.
    const mid = (quote.bid + quote.ask) / 2;
    const buyChance = Math.min(0.9, Math.max(0.1, 0.5 + 0.3 * (fair - mid)));
    want = way < buyChance ? 'buy' : 'sell';
  }
  let fill: Fill | null = null;
  let blocked = false;
  if (want === 'buy') {
    // The trader buys, so the player sells at their ask.
    if (position - 1 < -MM.limit) blocked = true;
    else fill = { side: 'sold', price: quote.ask, informed };
  } else if (want === 'sell') {
    if (position + 1 > MM.limit) blocked = true;
    else fill = { side: 'bought', price: quote.bid, informed };
  }
  const next = position + (fill ? (fill.side === 'bought' ? 1 : -1) : 0);
  return { turn, fair, quote, fill, blocked, position: next };
}

export interface MarketScore {
  total: number;
  position: number;
  /** Profit or loss in points, with open lots settled at the total. */
  pnl: number;
  /** Turns whose mid was within the tolerance of fair value. */
  midTurns: number;
  widest: number;
  checks: { mid: boolean; width: boolean; flat: boolean };
  passed: boolean;
}

export function scoreGame(game: MarketGame, turns: TurnResult[]): MarketScore {
  const total = game.dice[0] + game.dice[1] + game.dice[2];
  let cash = 0;
  for (const t of turns) {
    if (t.fill) cash += t.fill.side === 'sold' ? t.fill.price : -t.fill.price;
  }
  const position = turns.length ? turns[turns.length - 1].position : 0;
  const midTurns = turns.filter((t) => Math.abs((t.quote.bid + t.quote.ask) / 2 - t.fair) <= MM.midTolerance).length;
  const widest = Math.max(0, ...turns.map((t) => t.quote.ask - t.quote.bid));
  const checks = {
    mid: midTurns >= MM.midTurnsNeeded,
    width: widest <= MM.maxWidth,
    flat: Math.abs(position) <= MM.flatAtEnd,
  };
  return {
    total,
    position,
    pnl: cash + position * total,
    midTurns,
    widest,
    checks,
    passed: turns.length === MM.turns && checks.mid && checks.width && checks.flat,
  };
}

/** Signed number with a plus for gains, to one decimal where needed. */
export function points(x: number): string {
  const r = Math.round(x * 10) / 10;
  const s = Number.isInteger(r) ? String(Math.abs(r)) : Math.abs(r).toFixed(1);
  return r > 0 ? `+${s}` : r < 0 ? `−${s}` : '0';
}
