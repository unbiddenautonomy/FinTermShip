import { useMemo, useRef, useState } from 'react';
import { GREEKS, lesson, moveText, newGreeksRound, rupees, type GreeksItem } from '../lib/greeks';
import { finishGame } from '../lib/practice';
import { seededRng } from '../lib/questions';
import { Choices, GameFrame, Verdict, type GameProps } from './GameFrame';
import { Scale } from './icons';

const LEVELS = ['', 'An instant move: delta and gamma', 'Overnight: add theta', 'Overnight, with IV moving: add vega', 'Over a weekend: three days of theta'];

const plain = (x: number) => Math.abs(x).toLocaleString('en-IN');

export function GreeksGame({ unitId, seed, progress, today, onProgress, onFinish, onQuit }: GameProps) {
  const items = useMemo(() => newGreeksRound(seededRng(seed)), [seed]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [right, setRight] = useState<boolean[]>([]);
  const finished = useRef(false);
  const item = items[index];

  const pick = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    setRight((r) => [...r, i === item.answer]);
  };

  const finish = (all: boolean[]) => {
    if (finished.current) return;
    finished.current = true;
    const score = all.filter(Boolean).length;
    const passed = score >= GREEKS.passRight;
    const { progress: p, xp, firstPass } = finishGame(progress, unitId, today, score, passed);
    onProgress(p);
    const missed = items.filter((_, i) => !all[i]);
    onFinish({
      xp,
      firstTryCorrect: score,
      firstTryTotal: GREEKS.items,
      bestRun: 0,
      newIds: [],
      missedIds: [],
      kind: 'game',
      round: {
        unitId,
        kind: 'game',
        passed,
        firstPass,
        detail: `${score} of ${GREEKS.items} PnL calls right.${passed ? '' : ` To pass: ${GREEKS.passRight}.`}`,
        stat: { label: 'Hardest right', value: `Level ${Math.max(0, ...items.filter((_, i) => all[i]).map((x) => x.level))}` },
        score: { label: 'right', short: 'Right' },
        notes: [
          {
            title: 'The rule of thumb',
            items: [{ prompt: 'PnL ≈ delta × move + ½ × gamma × move² + vega × change in IV + theta × days', shown: 'Gamma pays the same sign whichever way spot moves; that is why short-gamma books fear big days.' }],
          },
          ...(missed.length
            ? [
                {
                  title: 'Calls to revisit',
                  items: missed.map((x) => ({ prompt: `${x.book.label}: ${moveText(x.move)}`, shown: `${rupees(x.total)} = ${splitText(x)}` })),
                },
              ]
            : []),
        ],
      },
    });
  };

  const next = () => {
    if (index + 1 >= items.length) {
      finish(right);
      return;
    }
    setIndex(index + 1);
    setPicked(null);
  };

  const b = item.book;
  return (
    <GameFrame
      unitId={unitId}
      done={right.length}
      total={GREEKS.items}
      counter={`Book ${index + 1} of ${GREEKS.items}`}
      icon={<Scale className="h-3.5 w-3.5" />}
      tone="sky"
      started={index > 0 || picked !== null}
      onQuit={onQuit}
      rules={
        <>
          <p>
            Each book shows its Greeks in rupees: <b>delta</b> per Nifty point, <b>gamma</b> as the change in delta per point, <b>vega</b> per vol point of IV, and <b>theta</b> per day.
          </p>
          <p>
            Then the market moves. Call the PnL: <b>delta × move + ½ × gamma × move² + vega × IV change + theta × days</b>.
          </p>
          <p>The wrong answers are the usual slips: dropping gamma or its half, a flipped sign, one day of theta over a weekend.</p>
        </>
      }
    >
      <section aria-label="The book" className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <p className="text-xs font-extrabold uppercase tracking-wider text-ink-3">
          Level {item.level} · {LEVELS[item.level]}
        </p>
        <p className="mt-1 text-lg font-extrabold text-ink">{b.label}</p>
        <dl className="num mt-3 grid grid-cols-2 gap-2 text-sm">
          <Greek name="Delta" value={`${rupees(b.delta)} a point`} />
          <Greek name="Gamma" value={`${rupees(b.gamma)} a point, per point`} />
          <Greek name="Vega" value={`${rupees(b.vega)} a vol point`} muted={!item.move.vol} />
          <Greek name="Theta" value={`${rupees(b.theta)} a day`} muted={!item.move.days} />
        </dl>
        <p className="mt-3 rounded-xl bg-sunken px-3 py-2 font-bold text-ink">{moveText(item.move).replace(/^./, (c) => c.toUpperCase())}.</p>
      </section>

      <p className="mt-5 mb-3 text-lg font-extrabold text-ink">What's the book's PnL?</p>
      <Choices labels={item.options.map((o) => rupees(o))} picked={picked} answer={item.answer} onPick={pick} mono />

      {picked !== null && (
        <Verdict good={picked === item.answer} title={picked === item.answer ? `Right: ${rupees(item.total)}` : `It's ${rupees(item.total)}`} next={index + 1 >= items.length ? 'See how you did' : 'Next book'} onNext={next}>
          <Split item={item} />
          <p className="leading-relaxed text-ink-2">{lesson(item)}</p>
        </Verdict>
      )}
    </GameFrame>
  );
}

function Greek({ name, value, muted }: { name: string; value: string; muted?: boolean }) {
  return (
    <div className={`rounded-xl border border-line px-3 py-2 ${muted ? 'opacity-50' : ''}`}>
      <dt className="text-[11px] font-extrabold uppercase tracking-wider text-ink-3">{name}</dt>
      <dd className="font-bold text-ink">{value}</dd>
    </div>
  );
}

function splitText(x: GreeksItem): string {
  return (['delta', 'gamma', 'vega', 'theta'] as const)
    .filter((k) => x.parts[k])
    .map((k) => `${k} ${rupees(x.parts[k])}`)
    .join(', ');
}

/** The PnL split into its four parts, as bars on one scale, with the sum behind each. */
function Split({ item }: { item: GreeksItem }) {
  const { book: b, move: m, parts } = item;
  const rows = [
    { name: 'Delta', value: parts.delta, how: `${rupees(b.delta)} × ${m.spot > 0 ? '' : '−'}${plain(m.spot)}` },
    { name: 'Gamma', value: parts.gamma, how: `½ × ${rupees(b.gamma)} × ${plain(m.spot)}²` },
    { name: 'Vega', value: parts.vega, how: `${rupees(b.vega)} × ${m.vol > 0 ? '' : '−'}${Math.abs(m.vol)}` },
    { name: 'Theta', value: parts.theta, how: `${rupees(b.theta)} × ${m.days}` },
  ].filter((r) => r.value !== 0);
  const top = Math.max(...rows.map((r) => Math.abs(r.value)), Math.abs(item.total), 1);
  return (
    <div className="space-y-2" aria-label="How the PnL splits">
      {[...rows, { name: 'Total', value: item.total, how: '' }].map((r) => (
        <div key={r.name}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-extrabold text-ink">{r.name}</span>
            <span className="num text-xs text-ink-3">{r.how}</span>
            <span className={`num font-extrabold ${r.value >= 0 ? 'text-good-ink' : 'text-bad-ink'}`}>{rupees(r.value)}</span>
          </div>
          <div className="relative mt-1 h-2 rounded-full bg-surface">
            <div
              className={`absolute top-0 h-2 rounded-full ${r.value >= 0 ? 'bg-good' : 'bg-bad'}`}
              style={{ width: `${(Math.abs(r.value) / top) * 50}%`, left: r.value >= 0 ? '50%' : `${50 - (Math.abs(r.value) / top) * 50}%` }}
            />
            <div className="absolute left-1/2 top-[-2px] h-3 w-px bg-ink-3" />
          </div>
        </div>
      ))}
    </div>
  );
}
