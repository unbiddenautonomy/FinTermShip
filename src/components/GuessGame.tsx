import { useMemo, useRef, useState } from 'react';
import { acceptRange, bigDays, fmtCorr, GUESS, isHit, newGuessRound, stdev, type GuessItem } from '../lib/guess';
import { finishGame } from '../lib/practice';
import { seededRng } from '../lib/questions';
import { GameFrame, Verdict, type GameProps } from './GameFrame';
import { Target } from './icons';
import { Button } from './ui';

const HEAD = { corr: 'Guess the correlation', vol: 'Guess the annual volatility', tails: 'Which one has fat tails?' };

export function GuessGame({ unitId, seed, progress, today, onProgress, onFinish, onQuit }: GameProps) {
  const items = useMemo(() => newGuessRound(seededRng(seed)), [seed]);
  const [index, setIndex] = useState(0);
  const [guess, setGuess] = useState<number>(0);
  const [locked, setLocked] = useState(false);
  const [hits, setHits] = useState<boolean[]>([]);
  const finished = useRef(false);
  const item = items[index];
  const value = item.kind === 'vol' && guess === 0 ? 20 : guess;

  const lock = (g = value) => {
    if (locked) return;
    setGuess(g);
    setLocked(true);
    setHits((h) => [...h, isHit(item, g)]);
  };

  const finish = (all: boolean[]) => {
    if (finished.current) return;
    finished.current = true;
    const score = all.filter(Boolean).length;
    const passed = score >= GUESS.passHits;
    const { progress: p, xp, firstPass } = finishGame(progress, unitId, today, score, passed);
    onProgress(p);
    const byKind = (k: GuessItem['kind']) => {
      const idx = items.map((x, i) => (x.kind === k ? i : -1)).filter((i) => i >= 0);
      return `${idx.filter((i) => all[i]).length} of ${idx.length}`;
    };
    onFinish({
      xp,
      firstTryCorrect: score,
      firstTryTotal: GUESS.items,
      bestRun: 0,
      newIds: [],
      missedIds: [],
      kind: 'game',
      round: {
        unitId,
        kind: 'game',
        passed,
        firstPass,
        detail: `${score} of ${GUESS.items} close enough.${passed ? '' : ` To pass: ${GUESS.passHits}.`}`,
        stat: { label: 'Vol calls', value: byKind('vol') },
        score: { label: 'close enough', short: 'Hits' },
        notes: [
          {
            title: 'By kind',
            items: [
              { prompt: 'Correlation from a scatter', shown: byKind('corr') },
              { prompt: 'Annual vol from a chart', shown: byKind('vol') },
              { prompt: 'Spotting fat tails', shown: byKind('tails') },
            ],
          },
          {
            title: 'Tricks that help',
            items: [
              { prompt: 'Correlation', shown: 'Picture the best straight line. A tight cigar shape is above 0.8; a round cloud is near 0; the sign is the slope.' },
              { prompt: 'Volatility', shown: 'Find a typical daily move and multiply by 16 (about √252): 1% a day is roughly 16% a year.' },
              { prompt: 'Fat tails', shown: 'Look for a few days far bigger than the rest. With normal returns, a move beyond 3 standard deviations is about a 1-in-370 day.' },
            ],
          },
        ],
      },
    });
  };

  const next = () => {
    if (index + 1 >= items.length) {
      finish(hits);
      return;
    }
    setIndex(index + 1);
    setGuess(0);
    setLocked(false);
  };

  const hit = locked && hits[hits.length - 1];
  return (
    <GameFrame
      unitId={unitId}
      done={hits.length}
      total={GUESS.items}
      counter={`${index + 1} of ${GUESS.items}`}
      icon={<Target className="h-3.5 w-3.5" />}
      tone="sky"
      started={index > 0 || locked}
      onQuit={onQuit}
      rules={
        <>
          <p>
            Ten charts. For a scatter, guess the <b>correlation</b> within {GUESS.corrTol}. For a price chart, guess the <b>annual volatility</b> within {Math.round(GUESS.volTol * 100)}% of the answer. For a pair of return series with the same volatility, pick the one with <b>fat tails</b>.
          </p>
          <p>The answer is worked out from the very points on screen, so what you see is what is scored.</p>
        </>
      }
    >
      <p className="mb-3 text-lg font-extrabold text-ink">{HEAD[item.kind]}</p>

      {item.kind === 'corr' && <Scatter xs={item.xs} ys={item.ys} />}
      {item.kind === 'vol' && <VolChart closes={item.closes} returns={item.returns} />}
      {item.kind === 'tails' && (
        <div className="grid gap-3">
          {item.series.map((s, i) => (
            <button
              key={i}
              type="button"
              disabled={locked}
              onClick={() => lock(i)}
              className={`rounded-2xl border-2 bg-surface p-3 text-left transition ${
                locked ? (i === item.answer ? 'border-good' : i === guess ? 'border-bad' : 'border-line opacity-60') : 'border-line shadow-press-line active:translate-y-[1px] active:shadow-none'
              }`}
            >
              <span className="text-sm font-extrabold text-ink">Series {i === 0 ? 'A' : 'B'}</span>
              <Bars returns={s} scale={Math.max(...item.series.flat().map(Math.abs))} />
            </button>
          ))}
        </div>
      )}

      {!locked && item.kind !== 'tails' && (
        <section aria-label="Your guess" className="mt-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold text-ink-2">Your guess</span>
            <span className="num text-3xl font-extrabold text-ink">{item.kind === 'corr' ? fmtCorr(value) : `${value}%`}</span>
          </div>
          <input
            type="range"
            className="w-full accent-[rgb(var(--sky))]"
            aria-label={item.kind === 'corr' ? 'Correlation' : 'Annual volatility in percent'}
            min={item.kind === 'corr' ? -1 : 2}
            max={item.kind === 'corr' ? 1 : 80}
            step={item.kind === 'corr' ? 0.05 : 1}
            value={value}
            onChange={(e) => setGuess(Number(e.target.value))}
          />
          <div className="flex justify-between text-xs text-ink-3">
            <span>{item.kind === 'corr' ? '−1' : '2%'}</span>
            <span>{item.kind === 'corr' ? '0' : ''}</span>
            <span>{item.kind === 'corr' ? '+1' : '80%'}</span>
          </div>
          <Button className="w-full text-base" onClick={() => lock()}>
            Lock it in
          </Button>
        </section>
      )}

      {locked && (
        <Verdict good={hit} title={hit ? 'Close enough' : 'Not this time'} next={index + 1 >= items.length ? 'See how you did' : 'Next chart'} onNext={next}>
          <p className="leading-relaxed text-ink-2">{feedback(item, guess)}</p>
        </Verdict>
      )}
    </GameFrame>
  );
}

function feedback(item: GuessItem, guess: number): string {
  if (item.kind === 'corr') return `The correlation is ${fmtCorr(item.answer)}. You said ${fmtCorr(guess)}; anything from ${acceptRange(item)} counted.`;
  if (item.kind === 'vol') {
    const daily = stdev(item.returns) * 100;
    return `Annual vol is ${item.answer}%. You said ${guess}%; ${acceptRange(item)} counted. A typical day here moved ${daily.toFixed(1)}%, and ${daily.toFixed(1)} × 16 ≈ ${Math.round(daily * 16)}%.`;
  }
  const fat = item.series[item.answer];
  const thin = item.series[1 - item.answer];
  const name = item.answer === 0 ? 'A' : 'B';
  return `Series ${name} has the fat tails: ${bigDays(fat)} day${bigDays(fat) === 1 ? '' : 's'} beyond 3 standard deviations, against ${bigDays(thin)} in the other. Both have the same volatility, so the fat-tailed one is calmer on most days.`;
}

const W = 320;

function Scatter({ xs, ys }: { xs: number[]; ys: number[] }) {
  const H = 240;
  const lim = (vs: number[]) => Math.max(...vs.map(Math.abs)) * 1.08;
  const lx = lim(xs);
  const ly = lim(ys);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-2xl border border-line bg-surface" role="img" aria-label="Scatter of two series">
      <line x1={W / 2} x2={W / 2} y1={8} y2={H - 8} className="stroke-line" />
      <line x1={8} x2={W - 8} y1={H / 2} y2={H / 2} className="stroke-line" />
      {xs.map((x, i) => (
        <circle key={i} cx={W / 2 + (x / lx) * (W / 2 - 10)} cy={H / 2 - (ys[i] / ly) * (H / 2 - 10)} r={3.2} className="fill-sky" opacity={0.75} />
      ))}
    </svg>
  );
}

function VolChart({ closes, returns }: { closes: number[]; returns: number[] }) {
  const H = 130;
  const lo = Math.min(...closes);
  const hi = Math.max(...closes);
  const span = Math.max(hi - lo, 4);
  const mid = (hi + lo) / 2;
  const top = mid + span * 0.55;
  const bottom = mid - span * 0.55;
  const x = (i: number) => 34 + (i / (closes.length - 1)) * (W - 42);
  const y = (v: number) => 8 + ((top - v) / (top - bottom)) * (H - 16);
  const d = closes.map((c, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(c).toFixed(1)}`).join('');
  const ticks = [Math.ceil(bottom), Math.round(mid), Math.floor(top)];
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-surface p-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Price over ${closes.length - 1} trading days, starting at 100`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={34} x2={W - 8} y1={y(t)} y2={y(t)} className="stroke-line" />
            <text x={28} y={y(t) + 3.5} textAnchor="end" className="fill-ink-3 text-[10px]">
              {t}
            </text>
          </g>
        ))}
        <path d={d} fill="none" className="stroke-sky" strokeWidth={2} strokeLinejoin="round" />
      </svg>
      <p className="px-1 text-xs font-bold text-ink-3">Daily moves, with lines at ±1% and ±2%</p>
      <Bars returns={returns} scale={0.03} grid />
    </div>
  );
}

/** Daily returns as bars around zero. */
function Bars({ returns, scale, grid = false }: { returns: number[]; scale: number; grid?: boolean }) {
  // With the ±1% and ±2% lines the chart needs room for their labels on the left.
  const H = grid ? 120 : 90;
  const left = grid ? 34 : 8;
  const mid = H / 2;
  const s = Math.max(scale, ...returns.map(Math.abs));
  const bw = (W - left - 8) / returns.length;
  const y = (r: number) => mid - (r / s) * (mid - 4);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label="Daily returns">
      <line x1={left} x2={W - 8} y1={mid} y2={mid} className="stroke-ink-3" strokeWidth={0.75} />
      {grid &&
        [0.01, 0.02, -0.01, -0.02].map((g) => (
          <g key={g}>
            <line x1={34} x2={W - 8} y1={y(g)} y2={y(g)} className="stroke-line" strokeDasharray="3 3" />
            <text x={28} y={y(g) + 3.5} textAnchor="end" className="fill-ink-3 text-[10px]">
              {g > 0 ? '+' : '−'}
              {Math.abs(g * 100)}%
            </text>
          </g>
        ))}
      {returns.map((r, i) => (
        <rect key={i} x={left + i * bw + 0.5} width={Math.max(bw - 1, 1)} y={r >= 0 ? y(r) : mid} height={Math.max(Math.abs(y(r) - mid), 0.5)} className={r >= 0 ? 'fill-good' : 'fill-bad'} />
      ))}
    </svg>
  );
}
