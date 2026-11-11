/**
 * Read the book: what a screen of quotes and trades says about the next tick.
 *
 * Twelve quick items of three kinds:
 * - the next tick: a five-level book and the last five trades. More size on
 *   the bid than the offer, and buyers lifting the offer, both point up. The
 *   learner calls the more likely way; the tick that follows is drawn from
 *   those odds and shown, so a right call can still go the other way;
 * - the queue: your bid sits behind others. Does it fill before the offer
 *   above is cleared and the price runs away from you?
 * - markouts: how far the mid moved after a fill, in ticks, and whether a
 *   client's fills keep going against you (toxic flow) or come back.
 */
import { shuffle, type Rng } from './questions';

export const READBOOK = {
  passRight: 10,
  tick: 0.05,
  pattern: ['tick', 'queue', 'tick', 'markout', 'tick', 'queue', 'tick', 'markout', 'tick', 'queue', 'tick', 'classify'] as ItemKind[],
  /** The next-tick odds: 0.5 + imbalance × this + tape flow × `flow`, kept between 10% and 90%. */
  imbalance: 0.35,
  flow: 0.15,
  /** Every next-tick item leans at least this far from 50:50. */
  minEdge: 0.12,
  /** In a queue item, one side is at least this many times quicker. */
  minRatio: 1.5,
};
export const ITEMS = READBOOK.pattern.length;

export type ItemKind = 'tick' | 'queue' | 'markout' | 'classify';
export interface Level {
  price: number;
  size: number;
}
export interface Print {
  side: 'buy' | 'sell';
  price: number;
  size: number;
}

export interface BookItem {
  kind: ItemKind;
  prompt: string;
  options: string[];
  answer: number;
  why: string;
  /** For a next-tick item: the book, the tape, the odds and what happened. */
  book?: { bids: Level[]; asks: Level[]; tape: Print[]; pUp: number; up: boolean };
}

const T = READBOOK.tick;
const between = (lo: number, hi: number, rng: Rng) => lo + Math.floor(rng() * (hi - lo + 1));
const onTick = (x: number) => Math.round(x / T) * T;
export const price = (x: number) => `₹${x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const qty = (n: number) => n.toLocaleString('en-IN');
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const ticks = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)} tick${Math.abs(n) === 1 ? '' : 's'}`;

export const upOdds = (bid: number, ask: number, buys: number, sells: number) =>
  clamp(0.5 + READBOOK.imbalance * ((bid - ask) / (bid + ask)) + READBOOK.flow * ((buys - sells) / (buys + sells)), 0.1, 0.9);

/** The microprice: the mid, weighted toward the side with less size. */
export const microprice = (bid: Level, ask: Level) => (bid.price * ask.size + ask.price * bid.size) / (bid.size + ask.size);

function tickItem(rng: Rng): BookItem {
  const bid0 = onTick(between(400, 3000, rng) + rng());
  for (;;) {
    const bids: Level[] = [];
    const asks: Level[] = [];
    for (let k = 0; k < 5; k++) {
      bids.push({ price: onTick(bid0 - k * T), size: 100 * (k === 0 ? between(2, 60, rng) : between(5, 80, rng)) });
      asks.push({ price: onTick(bid0 + (k + 1) * T), size: 100 * (k === 0 ? between(2, 60, rng) : between(5, 80, rng)) });
    }
    const tape: Print[] = Array.from({ length: 5 }, () => {
      const side = rng() < 0.5 ? 'buy' : 'sell';
      return { side, price: side === 'buy' ? asks[0].price : bids[0].price, size: 100 * between(1, 15, rng) };
    });
    const buys = tape.filter((p) => p.side === 'buy').length;
    const pUp = upOdds(bids[0].size, asks[0].size, buys, 5 - buys);
    if (Math.abs(pUp - 0.5) < READBOOK.minEdge) continue;
    const up = rng() < pUp;
    const favoured = pUp > 0.5;
    const mp = microprice(bids[0], asks[0]);
    const why =
      `${qty(bids[0].size)} bid against ${qty(asks[0].size)} offered at the top, and the last five trades were ${buys} buy${buys === 1 ? '' : 's'} and ${5 - buys} sell${5 - buys === 1 ? '' : 's'}. ` +
      `The microprice is ${price(mp)}, nearer the ${mp > (bids[0].price + asks[0].price) / 2 ? 'offer' : 'bid'}, so ${favoured ? 'up' : 'down'} is about ${Math.round(100 * Math.max(pUp, 1 - pUp))}% likely. ` +
      `This time it ticked ${up ? 'up' : 'down'}${up !== favoured ? ', the less likely way: you’re scored on the odds, not the luck' : ''}.`;
    return {
      kind: 'tick',
      prompt: 'Which way is the next tick more likely to go?',
      options: ['Up a tick', 'Down a tick'],
      answer: favoured ? 0 : 1,
      why,
      book: { bids, asks, tape: tape.reverse(), pUp, up },
    };
  }
}

function queueItem(rng: Rng): BookItem {
  const bid = onTick(between(400, 3000, rng) + rng());
  for (;;) {
    const ahead = 100 * between(10, 200, rng);
    const hit = 100 * between(1, 20, rng);
    const offer = 100 * between(5, 150, rng);
    const lift = 100 * between(1, 20, rng);
    const tFill = ahead / hit;
    const tGone = offer / lift;
    if (Math.max(tFill, tGone) / Math.min(tFill, tGone) < READBOOK.minRatio) continue;
    const fills = tFill < tGone;
    const sec = (t: number) => (t >= 10 ? Math.round(t).toString() : t.toFixed(1));
    return {
      kind: 'queue',
      prompt: `You're bidding ${price(bid)} with ${qty(ahead)} shares ahead of you in the queue. Sellers hit the bid at about ${qty(hit)} shares a second. The offer at ${price(bid + T)} shows ${qty(offer)} shares, and buyers lift it at about ${qty(lift)} a second. Which happens first?`,
      options: ['Your bid gets filled', 'The offer is cleared and the price ticks up without you'],
      answer: fills ? 0 : 1,
      why: `The queue ahead of you clears in about ${qty(ahead)} ÷ ${qty(hit)} = ${sec(tFill)} seconds; the offer lasts about ${qty(offer)} ÷ ${qty(lift)} = ${sec(tGone)} seconds. ${
        fills ? 'You get filled before the price moves.' : 'The price runs away from your bid: price-time priority means a place at the back of a long queue may never fill.'
      }`,
    };
  }
}

function markoutItem(rng: Rng): BookItem {
  const side: 'buy' | 'sell' = rng() < 0.5 ? 'buy' : 'sell';
  const p = onTick(between(400, 3000, rng) + rng());
  const k = (rng() < 0.5 ? -1 : 1) * between(1, 4, rng);
  const mid = side === 'sell' ? p - k * T : p + k * T;
  const size = 100 * between(2, 20, rng);
  const far = k + (k > 0 ? 2 : -2);
  const values = shuffle([k, -k, far, -far], rng);
  const formula = side === 'sell' ? `(your price − the mid after) ÷ tick = (${p.toFixed(2)} − ${mid.toFixed(2)}) ÷ ${T.toFixed(2)}` : `(the mid after − your price) ÷ tick = (${mid.toFixed(2)} − ${p.toFixed(2)}) ÷ ${T.toFixed(2)}`;
  return {
    kind: 'markout',
    prompt: `You ${side === 'sell' ? 'sold' : 'bought'} ${qty(size)} shares at ${price(p)}. Five seconds later the mid is ${price(mid)}. What is your 5-second markout, in ticks of ₹${T.toFixed(2)}?`,
    options: values.map(ticks),
    answer: values.indexOf(k),
    why: `For a ${side === 'sell' ? 'sale' : 'purchase'}, markout = ${formula} = ${ticks(k)}. ${
      k > 0 ? 'Positive: the price moved your way after you traded.' : 'Negative: the price moved against you after the trade. That is adverse selection: the other side knew something.'
    }`,
  };
}

function classifyItem(rng: Rng): BookItem {
  const toxic = rng() < 0.5;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const marks = toxic
    ? [-r1(0.3 + 0.5 * rng()), -r1(1 + 0.6 * rng()), -r1(2 + rng())]
    : [-r1(0.3 + 0.5 * rng()), -r1(0.1 + 0.2 * rng()), r1(0.1 + 0.3 * rng())];
  const fmt = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1)}`;
  const account = `account ${'BCDFGHJK'[between(0, 7, rng)]}`;
  return {
    kind: 'classify',
    prompt: `Your average markout on fills against ${account}, in ticks, 1 second, 5 seconds and 1 minute after each trade: ${marks.map(fmt).join(', ')}. What kind of flow is it?`,
    options: ['Toxic: they trade ahead of moves, so quote them wider', 'Benign: the price comes back, so keep quoting them tight'],
    answer: toxic ? 0 : 1,
    why: toxic
      ? 'The loss keeps growing the longer you wait: these traders know where the price is going. That is toxic flow, and market makers widen or skew against it.'
      : 'The small early loss fades and turns into a gain: the price comes back after their trades. That is benign flow, the kind market makers want to keep.',
  };
}

const MAKE: Record<ItemKind, (rng: Rng) => BookItem> = { tick: tickItem, queue: queueItem, markout: markoutItem, classify: classifyItem };

export const newReadBook = (rng: Rng): BookItem[] => READBOOK.pattern.map((k) => MAKE[k](rng));

export const passedReadBook = (right: number) => right >= READBOOK.passRight;
