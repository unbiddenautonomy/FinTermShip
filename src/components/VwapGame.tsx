import { useMemo, useRef, useState } from 'react';
import { termById } from '../lib/content';
import { finishGame } from '../lib/practice';
import { seededRng } from '../lib/questions';
import { averagePrice, bps, forecastIn, isDone, newVwapDay, playSlice, scoreVwap, shares, SLICES, startState, VWAP, vwapUpTo, type VwapDay, type VwapState } from '../lib/vwap';
import { GameFrame, Verdict, type GameProps } from './GameFrame';
import { Briefcase } from './icons';

const TERMS = ['vwap', 'vwap-algo', 'participation-rate', 'max-participation', 'volume-profile', 'parent-order', 'child-order', 'market-impact', 'temporary-impact', 'permanent-impact', 'arrival-price', 'implementation-shortfall', 'percent-done', 'front-load'];
const rupee = (x: number) => `₹${x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const slot = (i: number) => `${VWAP.times[i]} to ${VWAP.times[i + 1]}`;

function sliceNews(day: VwapDay, i: number): string | null {
  if (day.event.slice !== i) return null;
  return day.event.kind === 'seller' ? 'A big seller came in: volume nearly doubled and the price dipped.' : 'A lull: volume dried up to under half the forecast.';
}

export function VwapGame({ unitId, seed, progress, today, onProgress, onFinish, onQuit }: GameProps) {
  const day = useMemo(() => newVwapDay(seededRng(seed)), [seed]);
  const [state, setState] = useState<VwapState>(startState);
  const [shown, setShown] = useState(0);
  const finished = useRef(false);

  const played = state.slices.length;
  const pending = played > shown;
  const done = isDone(state);
  const i = shown;
  const left = VWAP.order - state.filled;
  const forecastSoFar = VWAP.profile.slice(0, played).reduce((a, b) => a + b, 0) * (VWAP.forecast / 100);
  const volumeSoFar = day.volumes.slice(0, played).reduce((a, b) => a + b, 0);
  const pace = forecastSoFar ? volumeSoFar / forecastSoFar - 1 : 0;
  const lastPrice = played ? state.slices[played - 1].market : VWAP.start;

  const pick = (rate: number) => {
    if (pending || done) return;
    setState((s) => playSlice(day, s, rate));
  };

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    const s = scoreVwap(day, state);
    const { progress: p, xp, firstPass } = finishGame(progress, unitId, today, s.met, s.passed);
    onProgress(p);
    onFinish({
      xp,
      firstTryCorrect: s.met,
      firstTryTotal: 2,
      bestRun: 0,
      newIds: [],
      missedIds: [],
      kind: 'game',
      round: {
        unitId,
        kind: 'game',
        passed: s.passed,
        firstPass,
        detail: `You bought ${shares(state.filled)} of ${shares(VWAP.order)} shares at ${rupee(s.avg)}, ${bps(s.slipBps)} against VWAP and ${bps(s.shortfallBps)} against the 9:15 price.`,
        stat: { label: 'vs VWAP', value: bps(s.slipBps) },
        score: { label: 'checks met', short: 'Checks' },
        notes: [
          {
            title: 'The checks',
            items: [
              { prompt: `Never over ${VWAP.maxRate}% of the volume`, shown: `${s.checks.capped ? 'Met' : 'Missed'}: your highest was ${s.maxRate}%${state.slices.length === SLICES && state.slices[SLICES - 1].rate === s.maxRate ? ', finishing in the last slice' : ''}` },
              { prompt: `Within ${VWAP.slipBps} bps of VWAP`, shown: `${s.checks.vwap ? 'Met' : 'Missed'}: ${bps(s.slipBps)} (VWAP ${rupee(s.vwap)})` },
            ],
          },
          {
            title: 'Your slices',
            items: state.slices.map((sl, k) => ({
              prompt: `${slot(k)}: ${sl.rate}% of volume${sliceNews(day, k) ? ` (${day.event.kind === 'seller' ? 'big seller' : 'lull'})` : ''}`,
              shown: sl.shares ? `bought ${shares(sl.shares)} at ${rupee(sl.price)}, market ${rupee(sl.market)}` : 'no trades',
            })),
          },
          {
            title: 'What the day shows',
            items: [
              { prompt: 'Pace with the volume', shown: 'A VWAP order should buy the same share of every slice: what is left, over the volume left. Then you trade at the day’s average price by construction.' },
              { prompt: 'Speed costs', shown: 'Taking more of the volume pushes the price further against you (temporary impact), and every share bought lifts the price for the rest of the day (permanent impact).' },
              { prompt: 'Surprises', shown: 'When volume runs ahead of the forecast, the pace rule buys more; in a lull it buys less. A fixed rate either finishes early or never finishes.' },
              { prompt: 'Two benchmarks', shown: `VWAP measures how you traded against the day. Implementation shortfall, ${bps(s.shortfallBps)} here, measures against the price when the order arrived, and includes the market's move.` },
            ],
          },
          {
            title: 'The terms',
            items: TERMS.map((id) => termById.get(id))
              .filter((t): t is NonNullable<typeof t> => t !== undefined)
              .map((t) => ({ prompt: t.term, shown: t.short })),
          },
        ],
      },
    });
  };

  const result = pending ? state.slices[shown] : null;
  const score = done && !pending ? scoreVwap(day, state) : null;

  return (
    <GameFrame
      unitId={unitId}
      done={Math.min(shown, SLICES)}
      total={SLICES}
      counter={done && !pending ? 'Done' : `Slice ${i + 1} of ${SLICES}`}
      icon={<Briefcase className="h-3.5 w-3.5" />}
      tone="sky"
      started={played > 0}
      onQuit={onQuit}
      rules={
        <>
          <p>
            A client wants {shares(VWAP.order)} shares bought by 15:30, against the day's VWAP. The forecast is {shares(VWAP.forecast)} shares for the day, so the order is{' '}
            {Math.round((100 * VWAP.order) / VWAP.forecast)}% of it. Volume is heavy at the open and the close and light at lunch.
          </p>
          <p>
            Before each of the first {SLICES - 1} slices, pick what share of the market's volume to take; the last slice, {slot(SLICES - 1)}, finishes whatever is left. The faster you buy, the more you pay above the market, and every share you buy nudges the
            price up for the rest of the day. One slice brings a surprise.
          </p>
          <p>
            Pass by never going over the client's {VWAP.maxRate}% cap, the last slice included, and ending within {VWAP.slipBps} bps of VWAP. A good pace: what's left over the
            forecast volume left.
          </p>
        </>
      }
    >
      <section aria-label="The order" className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs font-extrabold uppercase tracking-wider text-ink-3">{done && !pending ? 'Day over' : slot(i)}</p>
          <p className="num text-xs font-bold text-ink-3">last {rupee(lastPrice)}</p>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="num text-3xl font-extrabold text-ink">{Math.round((100 * state.filled) / VWAP.order)}%</span>
          <span className="text-sm font-bold text-ink-3">done, {shares(left)} to buy</span>
        </div>
        <VolumeChart day={day} state={state} upTo={played} />
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {!done && !pending && (
            <>
              <dt className="text-ink-3">Forecast this slice</dt>
              <dd className="num text-right font-bold text-ink-2">
                {shares(forecastIn(played))} ({VWAP.profile[played]}% of the day)
              </dd>
            </>
          )}
          {played > 0 && (
            <>
              <dt className="text-ink-3">Volume so far</dt>
              <dd className="num text-right font-bold text-ink-2">
                {Math.abs(pace) < 0.005 ? 'on forecast' : `${Math.round(Math.abs(pace) * 100)}% ${pace > 0 ? 'over' : 'under'} forecast`}
              </dd>
              <dt className="text-ink-3">Your average</dt>
              <dd className="num text-right font-bold text-ink-2">{state.filled ? rupee(averagePrice(state)) : '–'}</dd>
              <dt className="text-ink-3">VWAP so far</dt>
              <dd className="num text-right font-bold text-ink-2">{rupee(vwapUpTo(day, state, played))}</dd>
            </>
          )}
        </dl>
      </section>

      {result ? (
        <Verdict good={result.rate <= VWAP.maxRate} title={result.rate > VWAP.maxRate ? `Over the ${VWAP.maxRate}% cap: ${result.rate}% of the volume` : `${slot(shown)} done`} next={done ? 'To the close' : 'Next slice'} onNext={() => setShown(shown + 1)}>
          <p className="leading-relaxed text-ink-2">
            {result.shares
              ? `You bought ${shares(result.shares)} at ${rupee(result.price)}; the market traded ${shares(result.volume)} at ${rupee(result.market)}.`
              : `You sat out; the market traded ${shares(result.volume)} at ${rupee(result.market)}.`}{' '}
            {sliceNews(day, shown) ?? ''}
          </p>
          {result.rate > VWAP.maxRate && <p className="leading-relaxed text-ink-2">The client capped you at {VWAP.maxRate}% of the volume, to keep the order from moving the price.</p>}
        </Verdict>
      ) : score ? (
        <Verdict good={score.passed} title={score.passed ? 'Order done, inside VWAP' : `${score.met} of 2 checks met`} next="See how you did" onNext={finish}>
          <p className="leading-relaxed text-ink-2">
            You bought {shares(state.filled)} at {rupee(score.avg)} against a VWAP of {rupee(score.vwap)}: {bps(score.slipBps)}. Your highest share of a slice's volume was {score.maxRate}%.
            Against the 9:15 price you paid {bps(score.shortfallBps)}.
          </p>
        </Verdict>
      ) : (
        <section className="mt-4" aria-label="Your rate">
          {played === SLICES - 1 ? (
            <>
              <p className="mb-2 text-sm font-bold text-ink-2">
                The last slice: {shares(left)} left against a forecast of {shares(forecastIn(played))}, about {Math.round((100 * left) / forecastIn(played))}% of it.
              </p>
              <button
                type="button"
                onClick={() => pick(0)}
                className="w-full rounded-2xl bg-sky px-5 py-3.5 text-[15px] font-extrabold tracking-wide text-white transition active:translate-y-[2px]"
              >
                Finish the order
              </button>
            </>
          ) : (
            <>
              <p className="mb-2 text-sm font-bold text-ink-2">What share of the volume do you take from {VWAP.times[i]}?</p>
              <div className="grid grid-cols-3 gap-3">
                {VWAP.rates.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => pick(r)}
                    className="num rounded-2xl border-2 border-line bg-surface px-3 py-3.5 text-[17px] font-extrabold text-ink shadow-press-line transition hover:bg-sunken/60 active:translate-y-[1px] active:shadow-none"
                  >
                    {r === 0 ? 'Wait' : `${r}%`}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </GameFrame>
  );
}

/** Forecast volume per slice as outlines, the market's volume so far as bars, and your share on top. */
function VolumeChart({ day, state, upTo }: { day: VwapDay; state: VwapState; upTo: number }) {
  const W = 320;
  const H = 96;
  const gap = 4;
  const bw = (W - gap * (SLICES - 1)) / SLICES;
  const top = Math.max(...VWAP.profile.map((_, k) => forecastIn(k)), ...day.volumes.slice(0, upTo)) * 1.05;
  const h = (v: number) => (v / top) * (H - 14);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={`Volume by slice: ${upTo} of ${SLICES} slices traded`}>
      {VWAP.profile.map((_, k) => {
        const x = k * (bw + gap);
        const f = forecastIn(k);
        const played = k < upTo;
        const mine = played ? state.slices[k].shares : 0;
        return (
          <g key={k}>
            <rect x={x} y={H - 12 - h(f)} width={bw} height={h(f)} className="fill-none stroke-line" strokeDasharray="3 2" />
            {played && <rect x={x} y={H - 12 - h(day.volumes[k])} width={bw} height={h(day.volumes[k])} className="fill-sunken" />}
            {mine > 0 && <rect x={x} y={H - 12 - h(mine)} width={bw} height={h(mine)} className="fill-sky" />}
            {k % 3 === 0 && (
              <text x={x} y={H - 2} className="fill-ink-3 text-[9px]">
                {VWAP.times[k]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
