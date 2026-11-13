import { useMemo, useRef, useState } from 'react';
import { glossOrUnit, termById } from '../lib/content';
import { finishGame } from '../lib/practice';
import { seededRng } from '../lib/questions';
import { ITEMS, newReadBook, passedReadBook, price, qty, READBOOK, type BookItem } from '../lib/readbook';
import { Choices, GameFrame, Verdict, type GameProps } from './GameFrame';
import { Search } from './icons';

const TERMS = ['order-book', 'best-bid-offer', 'market-depth', 'mid-price', 'tick-size', 'price-time-priority', 'passive-order', 'aggressive-order', 'adverse-selection', 'informed-trader', 'markout', 'toxic-flow', 'fill-rate'];
const KIND_NAME: Record<BookItem['kind'], string> = { tick: 'The next tick', queue: 'The queue', markout: 'Markout', classify: 'Flow' };

export function ReadBookGame({ unitId, seed, progress, today, onProgress, onFinish, onQuit }: GameProps) {
  const items = useMemo(() => newReadBook(seededRng(seed)), [seed]);
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);
  const finished = useRef(false);

  const item = items[index];
  const picked = picks.length > index ? picks[index] : null;
  const right = picks.filter((p, i) => p === items[i].answer).length;

  const finish = (all: number[]) => {
    if (finished.current) return;
    finished.current = true;
    const n = all.filter((p, i) => p === items[i].answer).length;
    const passed = passedReadBook(n);
    const { progress: p, xp, firstPass } = finishGame(progress, unitId, today, n, passed);
    onProgress(p);
    const missed = items.map((it, i) => ({ it, i })).filter(({ it, i }) => all[i] !== it.answer);
    onFinish({
      xp,
      firstTryCorrect: n,
      firstTryTotal: ITEMS,
      bestRun: 0,
      newIds: [],
      missedIds: [],
      kind: 'game',
      round: {
        unitId,
        kind: 'game',
        passed,
        firstPass,
        detail: `${n} of ${ITEMS} right.`,
        stat: { label: 'Right', value: `${n}/${ITEMS}` },
        score: { label: 'right', short: 'Right' },
        notes: [
          ...(missed.length
            ? [
                {
                  title: 'The ones you missed',
                  items: missed.map(({ it, i }) => ({ prompt: `${i + 1}. ${KIND_NAME[it.kind]}: ${it.options[it.answer]}`, shown: it.why })),
                },
              ]
            : []),
          {
            title: 'How to read the book',
            items: [
              { prompt: 'Size at the top', shown: 'More size on the bid than the offer means the offer is likelier to be cleared first, so the next tick leans up. The microprice weights the mid toward the thinner side.' },
              { prompt: 'The tape', shown: 'Buyers lifting the offer again and again is pressure up; sellers hitting the bid is pressure down.' },
              { prompt: 'The queue', shown: 'Price-time priority fills the earliest orders at a price first. Time to fill is the size ahead of you over the rate it trades.' },
              { prompt: 'Markouts', shown: 'Markout is how far the mid moved after your fill, signed so that positive is good for you. Losses that keep growing mark toxic flow; losses that fade are benign.' },
            ],
          },
          {
            title: 'The terms',
            items: TERMS.map((id) => termById.get(id))
              .filter((t): t is NonNullable<typeof t> => t !== undefined)
              .map((t) => ({ prompt: t.term, shown: glossOrUnit(t) })),
          },
        ],
      },
    });
  };

  const next = () => {
    if (index + 1 >= items.length) finish(picks);
    else setIndex(index + 1);
  };

  return (
    <GameFrame
      unitId={unitId}
      done={picks.length}
      total={ITEMS}
      counter={`${index + 1} of ${ITEMS}`}
      icon={<Search className="h-3.5 w-3.5" />}
      tone="violet"
      started={picks.length > 0}
      onQuit={onQuit}
      rules={
        <>
          <p>
            {ITEMS} quick reads of a stock's screen. Some show the order book and the last five trades: call which way the next tick is more likely to go. Some put your bid in a
            queue: does it fill before the price moves away? And some are markouts: how far the price moved after a fill, in ticks of ₹{READBOOK.tick.toFixed(2)}.
          </p>
          <p>The tick that follows is drawn from the real odds, so a good call can still go the other way. You're scored on the call.</p>
          <p>
            Pass with {READBOOK.passRight} of {ITEMS} right.
          </p>
        </>
      }
    >
      <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-ink-3">{KIND_NAME[item.kind]}</p>
      {item.book && <BookView item={item} revealed={picked !== null} />}
      <p className="mt-3 text-[15px] font-bold leading-snug text-ink">{item.prompt}</p>
      <section className="mt-3" aria-label="Your answer">
        <Choices labels={item.options} picked={picked} answer={item.answer} onPick={(i) => picked === null && setPicks((p) => [...p, i])} mono={item.kind === 'markout'} />
      </section>
      {picked !== null && (
        <Verdict good={picked === item.answer} title={picked === item.answer ? 'Right' : 'Not quite'} next={index + 1 >= items.length ? 'See how you did' : 'Next'} onNext={next}>
          <p className="leading-relaxed text-ink-2">{item.why}</p>
          <p className="num text-sm font-bold text-ink-3">
            {right} of {picks.length} right so far
          </p>
        </Verdict>
      )}
    </GameFrame>
  );
}

/** Five levels each side, the last five trades, and the tick that came next once you've called it. */
function BookView({ item, revealed }: { item: BookItem; revealed: boolean }) {
  const b = item.book!;
  const top = Math.max(...b.bids.map((l) => l.size), ...b.asks.map((l) => l.size));
  return (
    <section aria-label="The order book" className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="grid grid-cols-2 gap-4">
        <table className="w-full text-sm">
          <caption className="sr-only">Bids and offers</caption>
          <thead>
            <tr className="text-xs text-ink-3">
              <th className="text-left font-bold">Size</th>
              <th className="text-right font-bold">Price</th>
            </tr>
          </thead>
          <tbody className="num">
            {[...b.asks].reverse().map((l) => (
              <tr key={`a${l.price}`} className="relative">
                <td className="relative py-0.5 text-left font-bold text-bad-ink">
                  <span className="absolute inset-y-0.5 left-0 rounded bg-bad-soft" style={{ width: `${(100 * l.size) / top}%` }} aria-hidden="true" />
                  <span className="relative">{qty(l.size)}</span>
                </td>
                <td className="py-0.5 text-right text-ink-2">{price(l.price)}</td>
              </tr>
            ))}
            {b.bids.map((l) => (
              <tr key={`b${l.price}`}>
                <td className="relative py-0.5 text-left font-bold text-good-ink">
                  <span className="absolute inset-y-0.5 left-0 rounded bg-good-soft" style={{ width: `${(100 * l.size) / top}%` }} aria-hidden="true" />
                  <span className="relative">{qty(l.size)}</span>
                </td>
                <td className="py-0.5 text-right text-ink-2">{price(l.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div>
          <p className="text-xs font-bold text-ink-3">Last trades, newest first</p>
          <ul className="num mt-1 space-y-0.5 text-sm">
            {b.tape.map((p, i) => (
              <li key={i} className={p.side === 'buy' ? 'text-good-ink' : 'text-bad-ink'}>
                {p.side === 'buy' ? 'Buy' : 'Sell'} {qty(p.size)} at {price(p.price)}
              </li>
            ))}
          </ul>
          {revealed && <p className="mt-3 rounded-xl bg-sunken px-3 py-2 text-sm font-bold text-ink-2">Next tick: {b.up ? 'up' : 'down'}</p>}
        </div>
      </div>
    </section>
  );
}
