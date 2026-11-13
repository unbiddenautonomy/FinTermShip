import { useMemo, useRef, useState } from 'react';
import { glossOrUnit, termById } from '../lib/content';
import { rupees } from '../lib/greeks';
import { brokenAt, callDay, fmtZ, heldPath, newPairsGame, PAIR_CALLS, PAIR_DAYS, pairPnl, PAIRS, ruleCalls, rulePath, ruleReason, scorePairs, shownZ, weekPnl, type Pair, type Pos } from '../lib/pairs';
import { finishGame } from '../lib/practice';
import { seededRng } from '../lib/questions';
import { GameFrame, Verdict, type GameProps } from './GameFrame';
import { Pairs } from './icons';
import { Button } from './ui';

const TERMS = ['pairs-trading', 'z-score', 'mean-reversion', 'half-life', 'cointegration', 'market-neutral', 'regime-change', 'stopped-out'];

const posText = (p: Pos, pair: Pair) => (p === 0 ? 'Flat' : p === 1 ? `Long the spread: buy ${pair.a}, sell ${pair.b}` : `Short the spread: sell ${pair.a}, buy ${pair.b}`);
const holding = (p: Pos, pair: Pair) => (p === 0 ? 'You are flat.' : p === 1 ? `You're long the spread: long ${pair.a}, short ${pair.b}.` : `You're short the spread: short ${pair.a}, long ${pair.b}.`);

interface Call {
  week: number;
  prev: Pos;
  pos: Pos;
  ok: boolean;
  reason: string;
  pnl: number;
}

export function PairsGame({ unitId, seed, progress, today, onProgress, onFinish, onQuit }: GameProps) {
  const pairs = useMemo(() => newPairsGame(seededRng(seed)), [seed]);
  const [calls, setCalls] = useState<Pos[][]>(() => pairs.map(() => []));
  const [pick, setPick] = useState<Pos>(0);
  const [last, setLast] = useState<Call | null>(null);
  const [pairIndex, setPairIndex] = useState(0);
  const finished = useRef(false);

  const pair = pairs[pairIndex];
  const mine = calls[pairIndex];
  const week = mine.length;
  const pairDone = week === PAIRS.weeks;
  const prev: Pos = week ? mine[week - 1] : 0;
  const shownTo = pairDone ? PAIR_DAYS : callDay(week);
  const z = pair.z[callDay(Math.min(week, PAIRS.weeks - 1))];
  const made = calls.reduce((n, c) => n + c.length, 0);
  const pnlSoFar = mine.reduce<number>((sum, p, w) => sum + weekPnl(pair, w, p) - Math.abs(p - (w ? mine[w - 1] : 0)) * PAIRS.cost, 0);

  const call = () => {
    if (pairDone) return;
    const broken = brokenAt(pair, week - 1);
    const ok = ruleCalls(prev, z, broken).includes(pick);
    const pnl = weekPnl(pair, week, pick) - Math.abs(pick - prev) * PAIRS.cost - (week === PAIRS.weeks - 1 ? Math.abs(pick) * PAIRS.cost : 0);
    setLast({ week, prev, pos: pick, ok, reason: ruleReason(prev, z, broken, pair), pnl });
    setCalls((cs) => cs.map((c, i) => (i === pairIndex ? [...c, pick] : c)));
  };

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    const s = scorePairs(pairs, calls);
    const { progress: p, xp, firstPass } = finishGame(progress, unitId, today, s.right, s.passed, s.pnl);
    onProgress(p);
    const broke = pairs.find((x) => x.breakDay !== null)!;
    const brokeIndex = pairs.indexOf(broke);
    onFinish({
      xp,
      firstTryCorrect: s.right,
      firstTryTotal: PAIR_CALLS,
      bestRun: 0,
      newIds: [],
      missedIds: [],
      kind: 'game',
      round: {
        unitId,
        kind: 'game',
        passed: s.passed,
        firstPass,
        detail: `${s.right} of ${PAIR_CALLS} weekly calls by the rules${s.missedStops ? `, but ${s.missedStops} call${s.missedStops === 1 ? '' : 's'} held a trade past the stop` : ''}.${s.passed ? '' : ` To pass: ${PAIRS.passRight}, with every stop taken.`}`,
        stat: { label: 'PnL', value: rupees(s.pnl) },
        score: { label: 'by the rules', short: 'Calls' },
        notes: [
          {
            title: 'The pairs',
            items: pairs.map((x, i) => {
              let right = 0;
              let before: Pos = 0;
              calls[i].forEach((c, w) => {
                if (ruleCalls(before, x.z[callDay(w)], brokenAt(x, w - 1)).includes(c)) right++;
                before = c;
              });
              return { prompt: `${x.name}${x.breakDay !== null ? ' (broke)' : ''}`, shown: `${right} of ${PAIRS.weeks} by the rules · ${rupees(pairPnl(x, calls[i]))}` };
            }),
          },
          {
            title: 'The rules on the same weeks',
            items: [
              { prompt: 'Your PnL, after costs', shown: rupees(s.pnl) },
              { prompt: 'The rules followed every week', shown: rupees(s.rulePnl) },
              { prompt: `${broke.name}: the rules, stopping at ±${PAIRS.stop}`, shown: rupees(pairPnl(broke, rulePath(broke))) },
              { prompt: `${broke.name}: holding the losing trade to the end`, shown: rupees(pairPnl(broke, heldPath(broke))) },
            ],
          },
          {
            title: 'Why the stop matters',
            items: [
              {
                prompt: `Pair ${brokeIndex + 1} stopped mean-reverting partway through: its spread started running and never came back.`,
                shown: 'You can’t tell a break from a big swing at the time. The stop caps the loss on the breaks, and leaving the pair alone afterwards stops you averaging into one.',
              },
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

  const nextPair = () => {
    if (pairIndex + 1 >= pairs.length) {
      finish();
      return;
    }
    setPairIndex(pairIndex + 1);
    setPick(0);
    setLast(null);
  };

  let pairRight = 0;
  let before: Pos = 0;
  mine.forEach((c, w) => {
    if (ruleCalls(before, pair.z[callDay(w)], brokenAt(pair, w - 1)).includes(c)) pairRight++;
    before = c;
  });
  const missed = mine.some((c, w) => (w ? mine[w - 1] : 0) !== 0 && c !== 0 && Math.abs(shownZ(pair.z[callDay(w)])) >= PAIRS.stop);
  const breakWeek = pair.breakDay !== null ? Math.floor((pair.breakDay - PAIRS.formation) / PAIRS.daysPerWeek) + 1 : 0;

  return (
    <GameFrame
      unitId={unitId}
      done={made}
      total={PAIR_CALLS}
      counter={`Pair ${pairIndex + 1} of ${pairs.length}`}
      icon={<Pairs className="h-3.5 w-3.5" />}
      tone="amber"
      started={made > 0}
      onQuit={onQuit}
      rules={
        <>
          <p>
            Three pairs of similar stocks, A and B, with ₹10 lakh on each side. The chart is the z-score of A against B, measured against the first {PAIRS.formation} days. Each week you choose: <b>long the spread</b> (buy A, sell B), <b>flat</b>, or <b>short the spread</b> (sell A, buy B).
          </p>
          <p>
            The rules: when the z-score passes ±{PAIRS.entry}, sell the dear one and buy the cheap one. Close when it's back within ±{PAIRS.exit} of 0. At ±{PAIRS.stop}, stop out and leave that pair alone: it may have broken. One of the three pairs will.
          </p>
          <p>
            Each week is judged against the rules from the position you hold. Pass with {PAIRS.passRight} of {PAIR_CALLS} calls by the rules and every stop taken.
          </p>
        </>
      }
    >
      <section aria-label="The pair" className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs font-extrabold uppercase tracking-wider text-ink-3">{pairDone ? 'Ten weeks done' : `Week ${week + 1} of ${PAIRS.weeks}`}</p>
          <p className="num text-xs font-bold text-ink-3">PnL {rupees(pnlSoFar)}</p>
        </div>
        <p className="text-lg font-extrabold text-ink">{pair.name}</p>
        {!pairDone && (
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-sm font-bold text-ink-3">z-score</span>
            <span className="num text-3xl font-extrabold text-ink">{fmtZ(z)}</span>
          </div>
        )}
        <ZChart z={pair.z} upTo={shownTo} />
        {!pairDone && <p className="mt-1 text-sm font-bold text-ink-2">{holding(prev, pair)}</p>}
      </section>

      {last && (
        <p className={`mt-3 rounded-xl px-3 py-2 text-sm font-bold ${last.ok ? 'bg-good-soft text-good-ink' : 'bg-bad-soft text-bad-ink'}`} aria-live="polite">
          Week {last.week + 1}: {last.ok ? 'by the rules.' : 'not the rules.'} {last.reason} That week: {rupees(last.pnl)}.
        </p>
      )}

      {pairDone ? (
        <Verdict
          good={pairRight >= PAIRS.weeks - 2 && !missed}
          title={pair.breakDay !== null ? 'This pair broke' : 'This pair kept reverting'}
          next={pairIndex + 1 >= pairs.length ? 'See how you did' : 'Next pair'}
          onNext={nextPair}
        >
          <p className="leading-relaxed text-ink-2">
            {pairRight} of {PAIRS.weeks} calls by the rules; PnL {rupees(pairPnl(pair, mine))} after costs, against {rupees(pairPnl(pair, rulePath(pair)))} for the rules.{' '}
            {pair.breakDay !== null
              ? `In week ${breakWeek} the spread started to run and never came back. ${missed ? 'You held on past the stop, which is how a pairs book loses a month in a week.' : `The stop at ±${PAIRS.stop} capped the loss.`} Holding the losing trade to the end would have made ${rupees(pairPnl(pair, heldPath(pair)))}.`
              : `Its half-life was about ${pair.halfLife} days: stretches of 2 or more snapped back within a few weeks.`}
          </p>
        </Verdict>
      ) : (
        <section aria-label="Your call" className="mt-4">
          <p className="mb-2 text-sm font-bold text-ink-2">Your position for the coming week</p>
          <div className="grid gap-2" role="radiogroup" aria-label="Position">
            {([1, 0, -1] as Pos[]).map((p) => {
              const on = pick === p;
              return (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-key="choice"
                  onClick={() => setPick(p)}
                  className={`rounded-2xl border-2 px-4 py-3 text-left text-[15px] font-bold transition ${on ? 'border-amber bg-amber-soft text-amber-ink' : 'border-line bg-surface text-ink-2'}`}
                >
                  {p === 0 && prev !== 0 ? 'Close the trade: flat' : posText(p, pair)}
                  {p === prev && p !== 0 ? ' (hold)' : ''}
                </button>
              );
            })}
          </div>
          <Button className="mt-4 w-full text-base" onClick={call}>
            {week === PAIRS.weeks - 1 ? 'Last week: go' : 'Next week'}
          </Button>
        </section>
      )}
    </GameFrame>
  );
}

/** The z-score so far, with the formation period in grey and lines at the entry and stop levels. */
function ZChart({ z, upTo }: { z: number[]; upTo: number }) {
  const W = 320;
  const H = 170;
  const left = 8;
  const right = 40;
  const lim = Math.max(5, Math.ceil(Math.max(...z.slice(0, upTo + 1).map(Math.abs)) + 0.5));
  const x = (t: number) => left + (t / PAIR_DAYS) * (W - left - right);
  const y = (v: number) => 6 + ((lim - v) / (2 * lim)) * (H - 12);
  const path = (from: number, to: number) =>
    z
      .slice(from, to + 1)
      .map((v, i) => `${i ? 'L' : 'M'}${x(from + i).toFixed(1)},${y(v).toFixed(1)}`)
      .join('');
  const levels: [number, string, string][] = [
    [PAIRS.stop, `+${PAIRS.stop} stop`, 'stroke-bad'],
    [PAIRS.entry, `+${PAIRS.entry} entry`, 'stroke-amber'],
    [0, '0', 'stroke-ink-3'],
    [-PAIRS.entry, `−${PAIRS.entry} entry`, 'stroke-amber'],
    [-PAIRS.stop, `−${PAIRS.stop} stop`, 'stroke-bad'],
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={`z-score over ${upTo} days, now ${fmtZ(z[upTo])}`}>
      <rect x={x(0)} width={x(PAIRS.formation) - x(0)} y={0} height={H} className="fill-sunken" />
      {levels.map(([v, label, cls]) => (
        <g key={label}>
          <line x1={left} x2={W - right} y1={y(v)} y2={y(v)} className={cls} strokeWidth={v === 0 ? 1 : 1.2} strokeDasharray={v === 0 ? undefined : '4 3'} opacity={0.8} />
          <text x={W - right + 3} y={y(v) + 3.5} className="fill-ink-3 text-[9px]">
            {label}
          </text>
        </g>
      ))}
      <text x={x(PAIRS.formation / 2)} y={H - 4} textAnchor="middle" className="fill-ink-3 text-[9px]">
        formation
      </text>
      <path d={path(0, PAIRS.formation)} fill="none" className="stroke-ink-3" strokeWidth={1.5} />
      <path d={path(PAIRS.formation, upTo)} fill="none" className="stroke-amber" strokeWidth={2} strokeLinejoin="round" />
      {Array.from({ length: PAIRS.weeks }, (_, w) => callDay(w))
        .filter((d) => d <= upTo)
        .map((d) => (
          <circle key={d} cx={x(d)} cy={y(z[d])} r={2.5} className="fill-amber" />
        ))}
    </svg>
  );
}
