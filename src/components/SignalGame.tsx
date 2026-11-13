import { useMemo, useRef, useState } from 'react';
import { glossOrUnit, termById } from '../lib/content';
import { finishGame } from '../lib/practice';
import { seededRng } from '../lib/questions';
import { ENTRIES, fmtSharpe, gridRight, isGood, LOOKBACKS, LUCK_TABLE, newSignalRound, patchMeans, SIGNAL, signalPassed, type GridChoice, type GridItem, type SignalItem } from '../lib/signal';
import { Choices, GameFrame, Verdict, type GameProps } from './GameFrame';
import { Sparkle } from './icons';
import { Button } from './ui';

const TERMS = ['overfitting', 'knife-edge', 'data-snooping', 'deflated-sharpe-ratio', 'out-of-sample', 'its-noise', 'information-coefficient'];

const cellName = (row: number, col: number) => `a ${LOOKBACKS[row]}-day lookback with entry at ${ENTRIES[col]}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function SignalGame({ unitId, seed, progress, today, onProgress, onFinish, onQuit }: GameProps) {
  const items = useMemo(() => newSignalRound(seededRng(seed)), [seed]);
  const [index, setIndex] = useState(0);
  const [cell, setCell] = useState<{ row: number; col: number } | null>(null);
  const [choice, setChoice] = useState<GridChoice | number | null>(null);
  const [right, setRight] = useState<boolean[]>([]);
  const finished = useRef(false);
  const item = items[index];
  const locked = choice !== null;

  const decide = (c: GridChoice | number) => {
    if (locked) return;
    setChoice(c);
    const ok = item.kind === 'grid' ? gridRight(item, c as GridChoice) : c === item.answer;
    setRight((r) => [...r, ok]);
  };

  const finish = (all: boolean[]) => {
    if (finished.current) return;
    finished.current = true;
    const score = all.filter(Boolean).length;
    const passed = signalPassed(score);
    const { progress: p, xp, firstPass } = finishGame(progress, unitId, today, score, passed);
    onProgress(p);
    const by = (k: SignalItem['kind']) => {
      const idx = items.map((x, i) => (x.kind === k ? i : -1)).filter((i) => i >= 0);
      return `${idx.filter((i) => all[i]).length} of ${idx.length}`;
    };
    onFinish({
      xp,
      firstTryCorrect: score,
      firstTryTotal: SIGNAL.items,
      bestRun: 0,
      newIds: [],
      missedIds: [],
      kind: 'game',
      round: {
        unitId,
        kind: 'game',
        passed,
        firstPass,
        detail: `${score} of ${SIGNAL.items} right.${passed ? '' : ` To pass: ${SIGNAL.passRight}.`}`,
        stat: { label: 'Grids called right', value: by('grid') },
        score: { label: 'right', short: 'Right' },
        notes: [
          {
            title: 'By kind',
            items: [
              { prompt: 'Pick a setting or bin the signal', shown: by('grid') },
              { prompt: 'How high luck reaches', shown: by('luck') },
              { prompt: 'How fast the edge decays', shown: by('decay') },
            ],
          },
          {
            title: 'Rules of thumb',
            items: [
              { prompt: 'Noise or edge?', shown: 'Compare the best result with what luck alone gives for that many tries. If it isn’t clearly higher, bin it.' },
              { prompt: 'Which setting?', shown: 'Take the middle of a broad patch of good settings. A lone peak whose neighbours are weak is usually luck.' },
              { prompt: 'Luck’s best', shown: 'About 1.5 for 10 tries, 2.5 for 100 and 3.2 for 1,000, divided by the square root of the years tested.' },
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
    if (index + 1 >= items.length) {
      finish(right);
      return;
    }
    setIndex(index + 1);
    setCell(null);
    setChoice(null);
  };

  const good = locked && right[right.length - 1];
  return (
    <GameFrame
      unitId={unitId}
      done={right.length}
      total={SIGNAL.items}
      counter={`${index + 1} of ${SIGNAL.items}`}
      icon={<Sparkle className="h-3.5 w-3.5" />}
      tone="violet"
      started={index > 0 || locked}
      onQuit={onQuit}
      rules={
        <>
          <p>
            Most items are a grid: one signal tested in sample with 25 settings, a lookback down the side and an entry level across the top, each cell showing its Sharpe ratio. Some signals are <b>pure noise</b>, some have a <b>real edge</b> on a broad patch of settings, and some have that edge plus one lucky setting.
          </p>
          <p>
            Take one setting live, or bin the signal. Then the lab shows each setting's true Sharpe. You're right if you bin noise, or pick a setting within {Math.round((1 - SIGNAL.keep) * 100)}% of the best true Sharpe.
          </p>
          <p>
            The best of many tries looks good by luck alone: about 1.5 standard errors for 10 tries, 2.5 for 100 and 3.2 for 1,000. One standard error of an annual Sharpe is about 1 ÷ √years. Pass with {SIGNAL.passRight} of {SIGNAL.items}.
          </p>
        </>
      }
    >
      {item.kind === 'grid' && (
        <>
          <p className="text-lg font-extrabold text-ink">{locked ? 'The truth behind it' : 'Take a setting live, or bin it'}</p>
          <p className="mb-3 text-sm text-ink-2">
            <b className="text-ink">{item.name}</b> · in sample, {item.years} years
          </p>
          <p className="mb-3 rounded-xl bg-violet-soft px-3 py-2 text-sm font-bold text-violet-ink">
            Luck alone: the best of 25 settings of pure noise over {item.years} years shows a Sharpe of about {fmtSharpe(item.luck)}.
          </p>
          <Heatmap values={item.inSample} label="In-sample Sharpe" selected={locked ? (choice === 'bin' ? null : (choice as { row: number; col: number })) : cell} onPick={locked ? undefined : (row, col) => setCell({ row, col })} />
          {locked && (
            <div className="mt-3">
              <Heatmap
                values={item.truth}
                label="True Sharpe"
                selected={choice === 'bin' ? null : (choice as { row: number; col: number })}
                good={(r, c) => item.type !== 'noise' && isGood(item, r, c)}
                note={item.type === 'noise' ? 'Pure noise: no setting has an edge.' : `Outlined in green: settings within ${Math.round((1 - SIGNAL.keep) * 100)}% of the best true Sharpe, which count as good picks.`}
              />
            </div>
          )}
          {!locked && (
            <div className="mt-4 grid gap-3">
              <Button className="w-full text-base" disabled={!cell} onClick={() => cell && decide(cell)}>
                {cell ? `Take ${LOOKBACKS[cell.row]} days, entry ${ENTRIES[cell.col]} live` : 'Tap a setting to take it live'}
              </Button>
              <Button variant="secondary" className="w-full" onClick={() => decide('bin')}>
                Bin it: it's noise
              </Button>
            </div>
          )}
          {locked && (
            <Verdict good={good} title={good ? 'Right call' : 'Not this time'} next={index + 1 >= items.length ? 'See how you did' : 'Next'} onNext={next}>
              <p className="leading-relaxed text-ink-2">{gridFeedback(item, choice as GridChoice)}</p>
            </Verdict>
          )}
        </>
      )}

      {item.kind === 'luck' && (
        <section aria-label="Question" className="space-y-3">
          <p className="text-lg font-extrabold leading-snug text-ink">
            A researcher tried {item.tries.toLocaleString('en-IN')} settings on {plural(item.years, 'year')} of data, and the best has a Sharpe of {fmtSharpe(item.found)}. About how high would the best of {item.tries.toLocaleString('en-IN')} reach by luck alone?
          </p>
          <Choices labels={item.options.map(fmtSharpe)} picked={locked ? (choice as number) : null} answer={item.answer} onPick={decide} mono />
          {locked && (
            <Verdict good={good} title={good ? 'Right' : 'Not quite'} next={index + 1 >= items.length ? 'See how you did' : 'Next'} onNext={next}>
              <p className="leading-relaxed text-ink-2">
                The best of {item.tries.toLocaleString('en-IN')} pure-noise tries lands about {LUCK_TABLE[item.tries]} standard errors up, and one standard error over {plural(item.years, 'year')} is 1 ÷ √{item.years} = {(1 / Math.sqrt(item.years)).toFixed(2)}. So luck alone reaches about {fmtSharpe(item.options[item.answer])}.{' '}
                {item.found <= item.options[item.answer] * 1.25
                  ? `Their ${fmtSharpe(item.found)} is no better than that: deflated for the tries, it's noise.`
                  : `Their ${fmtSharpe(item.found)} is well above that, so it's worth a fresh test out of sample.`}
              </p>
            </Verdict>
          )}
        </section>
      )}

      {item.kind === 'decay' && (
        <section aria-label="Question" className="space-y-3">
          <p className="text-lg font-extrabold leading-snug text-ink">The chart shows a signal's IC by how many days late you trade it. About how many days does its edge take to halve?</p>
          <DecayChart ic={item.ic} />
          <Choices labels={item.options.map((d) => plural(d, 'day'))} picked={locked ? (choice as number) : null} answer={item.answer} onPick={decide} />
          {locked && (
            <Verdict good={good} title={good ? 'Right' : 'Not quite'} next={index + 1 >= items.length ? 'See how you did' : 'Next'} onNext={next}>
              <p className="leading-relaxed text-ink-2">
                Its half-life is {plural(item.halfLife, 'day')}: the IC falls from {item.ic[0].toFixed(3)} to {(item.ic[0] / 2).toFixed(3)} by day {item.halfLife}.{' '}
                {item.halfLife <= 2
                  ? 'An edge that fades this fast has to be traded at once, and paying up to trade quickly eats into it.'
                  : 'An edge that fades this slowly can wait for cheaper fills, or be rebalanced less often.'}
              </p>
            </Verdict>
          )}
        </section>
      )}
    </GameFrame>
  );
}

function gridFeedback(item: GridItem, choice: GridChoice): string {
  const best = Math.max(...item.inSample.flat());
  const top = Math.max(...item.truth.flat());
  const luck = `the ${fmtSharpe(item.luck)} that luck alone reaches with 25 settings on ${item.years} years`;
  if (item.type === 'noise') {
    return choice === 'bin'
      ? `Right to bin it. The best setting showed ${fmtSharpe(best)}, no better than ${luck}. Every setting's true Sharpe was 0.`
      : `That was noise: every setting's true Sharpe was 0. Its best showed ${fmtSharpe(best)}, but that's no better than ${luck}.`;
  }
  const centre = patchMeans(item.truth);
  let mid = { row: 0, col: 0 };
  centre.forEach((r, i) => r.forEach((v, j) => v > centre[mid.row][mid.col] && (mid = { row: i, col: j })));
  if (choice === 'bin') return `There was a real edge: a broad patch of settings around ${cellName(mid.row, mid.col)}, with a true Sharpe of up to ${fmtSharpe(top)}, well above ${luck}.`;
  const t = item.truth[choice.row][choice.col];
  if (isGood(item, choice.row, choice.col))
    return t >= top
      ? `Good pick: this is the strongest setting of all, with a true Sharpe of ${fmtSharpe(t)}. Its neighbours are strong too, so a small change won't break it.`
      : `Good pick: this setting's true Sharpe is ${fmtSharpe(t)}, against ${fmtSharpe(top)} at the very best. Its neighbours are strong too, so a small change won't break it.`;
  const wasPeak = item.inSample[choice.row][choice.col] === best;
  return wasPeak
    ? `That lone peak was luck: its true Sharpe is ${fmtSharpe(t)}, and its neighbours were weak even in sample. The real edge was the broad patch around ${cellName(mid.row, mid.col)}, with a true Sharpe of up to ${fmtSharpe(top)}.`
    : `This setting's true Sharpe is ${fmtSharpe(t)}. The real edge was the broad patch around ${cellName(mid.row, mid.col)}, with a true Sharpe of up to ${fmtSharpe(top)}.`;
}

function Heatmap({
  values,
  label,
  selected,
  onPick,
  good,
  note,
}: {
  values: number[][];
  label: string;
  selected: { row: number; col: number } | null;
  onPick?: (row: number, col: number) => void;
  good?: (row: number, col: number) => boolean;
  note?: string;
}) {
  return (
    <figure className="rounded-2xl border border-line bg-surface p-2">
      <figcaption className="mb-1 flex items-baseline justify-between px-1 text-xs font-bold text-ink-3">
        <span className="text-ink-2">{label}</span>
        <span>Entry level (sd) →</span>
      </figcaption>
      <div className="grid grid-cols-[2.5rem_repeat(5,minmax(0,1fr))] gap-1">
        <span className="text-[10px] font-bold leading-tight text-ink-3">Look-back</span>
        {ENTRIES.map((e) => (
          <span key={e} className="num text-center text-xs font-bold text-ink-3">
            {e}
          </span>
        ))}
        {values.map((row, i) => (
          <div key={i} className="contents">
            <span className="num self-center text-xs font-bold text-ink-3">{LOOKBACKS[i]}d</span>
            {row.map((v, j) => {
              const on = selected?.row === i && selected?.col === j;
              const tint = v >= 0 ? `rgb(var(--good) / ${Math.min(0.85, (v / 1.8) * 0.85).toFixed(2)})` : `rgb(var(--bad) / ${Math.min(0.6, (-v / 1.2) * 0.6).toFixed(2)})`;
              const ring = on ? 'ring-[3px] ring-ink' : good?.(i, j) ? 'ring-2 ring-good-ink' : '';
              return (
                <button
                  key={j}
                  type="button"
                  aria-pressed={onPick ? on : undefined}
                  aria-label={`${LOOKBACKS[i]}-day lookback, entry ${ENTRIES[j]}: Sharpe ${fmtSharpe(v)}`}
                  disabled={!onPick}
                  onClick={() => onPick?.(i, j)}
                  style={{ backgroundColor: tint }}
                  className={`num h-10 rounded-lg text-sm font-extrabold text-ink transition ${ring} ${onPick ? 'active:scale-95' : ''}`}
                >
                  {fmtSharpe(v)}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {note && <p className="mt-2 px-1 text-xs font-bold text-ink-3">{note}</p>}
    </figure>
  );
}

function DecayChart({ ic }: { ic: number[] }) {
  const W = 320;
  const H = 150;
  const left = 34;
  const bottom = 20;
  const top = ic[0] * 1.15;
  const bw = (W - left - 8) / ic.length;
  const y = (v: number) => 8 + (1 - v / top) * (H - bottom - 8);
  return (
    <figure className="rounded-2xl border border-line bg-surface p-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`IC starts at ${ic[0].toFixed(3)} on day 0 and falls each day`}>
        {[ic[0], ic[0] / 2].map((g, k) => (
          <g key={k}>
            <line x1={left} x2={W - 8} y1={y(g)} y2={y(g)} className="stroke-line" strokeDasharray={k ? '4 3' : undefined} />
            <text x={left - 4} y={y(g) + 3.5} textAnchor="end" className="fill-ink-3 text-[10px]">
              {g.toFixed(3)}
            </text>
          </g>
        ))}
        <text x={W - 8} y={y(ic[0] / 2) - 4} textAnchor="end" className="fill-ink-3 text-[10px]">
          half of day 0
        </text>
        {ic.map((v, k) => (
          <g key={k}>
            <rect x={left + k * bw + 2} width={bw - 4} y={y(v)} height={y(0) - y(v)} rx={2} className="fill-violet" />
            <text x={left + k * bw + bw / 2} y={H - 6} textAnchor="middle" className="fill-ink-3 text-[10px]">
              {k}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="px-1 text-xs font-bold text-ink-3">Days late →</figcaption>
    </figure>
  );
}
