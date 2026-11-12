import { useMemo, useRef, useState, type ReactNode } from 'react';
import { termName } from '../lib/content';
import { emptyLegs, grid, isHeld, newPayoffRound, PAYOFF, payoffAt, payoffPassed, payoffStats, samePayoff, solves, type Chain, type Instrument, type Leg, type Target } from '../lib/payoff';
import { finishGame } from '../lib/practice';
import { seededRng } from '../lib/questions';
import { GameFrame, Verdict, type GameProps } from './GameFrame';
import { Target as TargetIcon } from './icons';
import { Button } from './ui';

const n = (x: number) => Math.round(x).toLocaleString('en-IN');
const NAMES: Record<Instrument, string> = { call: 'calls', put: 'puts', fut: 'futures' };

/** "Buy 1 24,800 call, sell 1 25,000 call". */
function legsText(legs: Leg[]): string {
  return legs
    .filter((l) => l.qty)
    .map((l) => `${l.qty > 0 ? 'buy' : 'sell'} ${Math.abs(l.qty)} ${l.kind === 'fut' ? 'future' : `${n(l.strike)} ${l.kind}`}`)
    .join(', ')
    .replace(/^./, (c) => c.toUpperCase());
}

function statsText(chain: Chain, legs: Leg[]): string[] {
  const s = payoffStats(chain, legs);
  if (s.flat) return [`Locked in: ${n(payoffAt(chain, legs, chain.fut))} points wherever Nifty ends.`];
  const out: string[] = [];
  if (s.breakevens.length) out.push(`Breakeven${s.breakevens.length > 1 ? 's' : ''} ${s.breakevens.map(n).join(' and ')}`);
  out.push(s.maxProfit === null ? 'Max profit unlimited' : `Max profit ${n(s.maxProfit)} points${s.profitAtZero ? ', only if Nifty went to zero' : ''}`);
  out.push(s.maxLoss === null ? 'Max loss unlimited' : `Max loss ${n(Math.abs(s.maxLoss))} points${s.lossAtZero ? ', only if Nifty went to zero' : ''}`);
  return out;
}

export function PayoffGame({ unitId, seed, progress, today, onProgress, onFinish, onQuit }: GameProps) {
  const round = useMemo(() => newPayoffRound(seededRng(seed)), [seed]);
  const { chain } = round;
  const [index, setIndex] = useState(0);
  const [legs, setLegs] = useState<Leg[]>(() => emptyLegs(chain, round.targets[0]));
  const [phase, setPhase] = useState<'build' | 'solved' | 'shown'>('build');
  const [misses, setMisses] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [results, setResults] = useState<{ target: Target; solved: boolean; built: Leg[] }[]>([]);
  const finished = useRef(false);

  const target = round.targets[index];
  const matches = samePayoff(chain, target.legs, legs);

  const change = (i: number, d: number) => {
    if (phase !== 'build' || isHeld(target, legs[i])) return;
    setNote(null);
    setLegs((ls) => ls.map((l, j) => (j === i ? { ...l, qty: Math.max(-PAYOFF.maxQty, Math.min(PAYOFF.maxQty, l.qty + d)) } : l)));
  };

  const check = () => {
    if (solves(chain, target, legs)) {
      setPhase('solved');
      setResults((r) => [...r, { target, solved: true, built: legs }]);
    } else {
      setMisses((m) => m + 1);
      setNote(
        matches
          ? `Same shape, but this one has to be built without ${target.banned!.map((b) => NAMES[b]).join(' or ')}.`
          : 'Not yet. Look at where the two lines part: check the slope there, then which strike changes it.',
      );
    }
  };

  const reveal = () => {
    const shown = emptyLegs(chain, target).map((l) => ({ ...l, qty: target.legs.find((t) => t.kind === l.kind && (l.kind === 'fut' || t.strike === l.strike))?.qty ?? 0 }));
    setLegs(shown);
    setNote(null);
    setPhase('shown');
    setResults((r) => [...r, { target, solved: false, built: shown }]);
  };

  const finish = (all: typeof results) => {
    if (finished.current) return;
    finished.current = true;
    const solved = all.filter((r) => r.solved).length;
    const passed = payoffPassed(solved);
    const { progress: p, xp, firstPass } = finishGame(progress, unitId, today, solved, passed);
    onProgress(p);
    onFinish({
      xp,
      firstTryCorrect: solved,
      firstTryTotal: PAYOFF.targets,
      bestRun: 0,
      newIds: [],
      missedIds: [],
      kind: 'game',
      round: {
        unitId,
        kind: 'game',
        passed,
        firstPass,
        detail: `You built ${solved} of ${PAYOFF.targets} payoffs yourself.${passed ? '' : ` To pass: ${PAYOFF.passSolved}.`}`,
        stat: { label: 'Level reached', value: `${Math.max(...all.filter((r) => r.solved).map((r) => r.target.level), 0)} of 3` },
        score: { label: 'solved', short: 'Solved' },
        notes: [
          {
            title: 'The targets',
            items: all.map((r) => ({
              prompt: `${r.target.name}${r.target.termId ? ` (${termName(r.target.termId)})` : ''}`,
              shown: r.solved ? `Solved: ${legsText(r.built)}` : `Answer shown: ${legsText(r.target.legs)}`,
            })),
          },
        ],
      },
    });
  };

  const next = () => {
    if (index + 1 >= round.targets.length) {
      finish(results);
      return;
    }
    setIndex(index + 1);
    setLegs(emptyLegs(chain, round.targets[index + 1]));
    setPhase('build');
    setMisses(0);
    setNote(null);
  };

  const banned = (k: Instrument) => !!target.banned?.includes(k);
  const strikeLegs = chain.strikes.map((k) => ({
    k,
    call: legs.findIndex((l) => l.kind === 'call' && l.strike === k),
    put: legs.findIndex((l) => l.kind === 'put' && l.strike === k),
  }));
  const futIndex = legs.findIndex((l) => l.kind === 'fut');

  return (
    <GameFrame
      unitId={unitId}
      done={results.length}
      total={PAYOFF.targets}
      counter={`Target ${index + 1} of ${PAYOFF.targets}`}
      icon={<TargetIcon className="h-3.5 w-3.5" />}
      started={index > 0 || legs.some((l) => l.qty && !isHeld(target, l))}
      onQuit={onQuit}
      rules={
        <>
          <p>
            The dashed line is the payoff the desk wants at expiry: profit or loss in Nifty points, after premiums, for wherever Nifty ends. Nifty futures trade at{' '}
            <b>{n(chain.fut)}</b>.
          </p>
          <p>
            Buy (+) or sell (−) calls, puts and the future, up to {PAYOFF.maxQty} lots each. Your line moves as you build. When it sits on the target, press <b>Check</b>.
          </p>
          <p>Every price comes from one option chain, so any build with the same payoff counts. Stuck? You can see the answer, but that target won't count.</p>
        </>
      }
    >
      <section aria-label="Target" className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <p className="text-xs font-extrabold uppercase tracking-wider text-ink-3">
          Level {target.level} · {target.legs.length} leg{target.legs.length === 1 ? '' : 's'}
        </p>
        <p className="mt-1 font-bold leading-snug text-ink">{target.brief}</p>
        <PayoffChart chain={chain} target={target.legs} mine={legs} />
        <div className="mt-1 flex items-center justify-between text-xs text-ink-3">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0 w-5 border-t-2 border-dashed border-ink-3" /> Target
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0 w-5 border-t-[3px] border-brand" /> Yours
          </span>
          <span className={`font-extrabold ${matches ? 'text-good-ink' : ''}`}>{matches ? 'Lines match' : 'Not matching yet'}</span>
        </div>
      </section>

      {phase === 'build' ? (
        <section aria-label="Build your position" className="mt-4">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-2 gap-y-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-ink-3">Strike</span>
            <span className="w-[7.5rem] text-center text-xs font-extrabold uppercase tracking-wider text-ink-3">Calls</span>
            <span className="w-[7.5rem] text-center text-xs font-extrabold uppercase tracking-wider text-ink-3">Puts</span>
            {strikeLegs.map(({ k, call, put }, i) => (
              <Row key={k} label={n(k)} sub={`C ${chain.call[i]} · P ${chain.put[i]}`} atm={k === chain.fut}>
                <Qty value={legs[call].qty} label={`${n(k)} call`} disabled={banned('call')} onChange={(d) => change(call, d)} />
                <Qty value={legs[put].qty} label={`${n(k)} put`} disabled={banned('put')} onChange={(d) => change(put, d)} />
              </Row>
            ))}
            <Row label="Future" sub={`at ${n(chain.fut)}`}>
              <span className="col-span-2 flex justify-center">
                <Qty value={legs[futIndex].qty} label="future" disabled={banned('fut')} held={isHeld(target, legs[futIndex])} onChange={(d) => change(futIndex, d)} />
              </span>
            </Row>
          </div>
          {target.banned && <p className="mt-2 text-sm font-bold text-amber-ink">No {target.banned.map((b) => NAMES[b]).join(' or ')} for this one.</p>}
          {target.holds && <p className="mt-2 text-sm font-bold text-sky-ink">You already hold {legsText(target.holds).toLowerCase().replace(/^buy /, '')} long. It stays in the position.</p>}
          {note && (
            <p className="mt-3 animate-pop rounded-2xl bg-bad-soft px-4 py-3 text-sm font-bold text-bad-ink" role="status">
              {note}
            </p>
          )}
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
            <Button onClick={check} disabled={!legs.some((l) => l.qty && !isHeld(target, l))}>
              Check
            </Button>
            <Button variant="secondary" onClick={() => {
                setLegs(emptyLegs(chain, target));
                setNote(null);
              }}>
              Clear
            </Button>
          </div>
          {misses > 0 && (
            <button type="button" onClick={reveal} className="mt-3 w-full py-2 text-sm font-extrabold text-ink-3 hover:text-ink-2">
              Show the answer (this target won't count)
            </button>
          )}
        </section>
      ) : (
        <Verdict good={phase === 'solved'} title={phase === 'solved' ? `Built it: ${target.name}` : `The answer: ${target.name}`} next={index + 1 >= round.targets.length ? 'See how you did' : 'Next target'} onNext={next}>
          <p className="font-bold text-ink">{legsText(phase === 'solved' ? legs : target.legs)}</p>
          <p className="leading-relaxed text-ink-2">{target.why}</p>
          <ul className="num space-y-0.5 text-sm font-bold text-ink-2">
            {statsText(chain, target.legs).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          {target.termId && (
            <p className="text-sm text-ink-3">
              Practises: <b className="text-ink-2">{termName(target.termId)}</b>
            </p>
          )}
        </Verdict>
      )}
    </GameFrame>
  );
}

function Row({ label, sub, atm, children }: { label: string; sub: string; atm?: boolean; children: ReactNode }) {
  return (
    <>
      <span className="min-w-0">
        <span className={`num block font-extrabold ${atm ? 'text-brand-ink' : 'text-ink'}`}>
          {label}
          {atm && <span className="ml-1 text-[10px] font-extrabold uppercase tracking-wider">ATM</span>}
        </span>
        <span className="num block text-xs text-ink-3">{sub}</span>
      </span>
      {children}
    </>
  );
}

function Qty({ value, label, disabled, held, onChange }: { value: number; label: string; disabled?: boolean; held?: boolean; onChange: (d: number) => void }) {
  const tone = value > 0 ? 'text-good-ink' : value < 0 ? 'text-bad-ink' : 'text-ink-3';
  const locked = disabled || held;
  return (
    <span className={`flex w-[7.5rem] items-center justify-between rounded-xl border p-1 ${held ? 'border-sky bg-sky-soft' : 'border-line bg-surface'} ${disabled ? 'opacity-40' : ''}`}>
      <button type="button" disabled={locked || value <= -PAYOFF.maxQty} onClick={() => onChange(-1)} aria-label={`Sell one more ${label}`} className="h-9 w-9 rounded-lg bg-sunken text-lg font-extrabold text-ink-2 disabled:opacity-40">
        −
      </button>
      <span className={`num w-8 text-center text-lg font-extrabold ${tone}`} aria-label={`${label}: ${value}`}>
        {value > 0 ? `+${value}` : value < 0 ? `−${-value}` : '0'}
      </span>
      <button type="button" disabled={locked || value >= PAYOFF.maxQty} onClick={() => onChange(1)} aria-label={`Buy one more ${label}`} className="h-9 w-9 rounded-lg bg-sunken text-lg font-extrabold text-ink-2 disabled:opacity-40">
        +
      </button>
    </span>
  );
}

/** Target payoff dashed, the learner's solid, with the zero line and the strikes. */
function PayoffChart({ chain, target, mine }: { chain: Chain; target: Leg[]; mine: Leg[] }) {
  const W = 320;
  const H = 180;
  const pad = { l: 44, r: 8, t: 10, b: 22 };
  const xs = grid(chain);
  const t = xs.map((s) => payoffAt(chain, target, s));
  const m = xs.map((s) => payoffAt(chain, mine, s));
  let lo = Math.min(0, ...t, ...m);
  let hi = Math.max(0, ...t, ...m);
  if (hi - lo < 100) [lo, hi] = [lo - 50, hi + 50];
  const span = hi - lo;
  lo -= span * 0.08;
  hi += span * 0.08;
  const x = (s: number) => pad.l + ((s - xs[0]) / (xs[xs.length - 1] - xs[0])) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b);
  const line = (vs: number[]) => vs.map((v, i) => `${i ? 'L' : 'M'}${x(xs[i]).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const yTicks = [...new Set([Math.round(hi - span * 0.08), 0, Math.round(lo + span * 0.08)])];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label="Payoff at expiry: target and yours">
      {chain.strikes.map((k) => (
        <line key={k} x1={x(k)} x2={x(k)} y1={pad.t} y2={H - pad.b} className="stroke-line" strokeWidth={1} />
      ))}
      <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className="stroke-ink-3" strokeWidth={1} strokeDasharray="2 3" />
      {yTicks.map((v) => (
        <text key={v} x={pad.l - 6} y={y(v) + 3.5} textAnchor="end" className="fill-ink-3 text-[10px]">
          {v > 0 ? '+' : v < 0 ? '−' : ''}
          {n(Math.abs(v))}
        </text>
      ))}
      {[chain.strikes[0], chain.fut, chain.strikes[chain.strikes.length - 1]].map((k) => (
        <text key={k} x={x(k)} y={H - 6} textAnchor="middle" className="fill-ink-3 text-[10px]">
          {n(k)}
        </text>
      ))}
      <path d={line(t)} fill="none" className="stroke-ink-3" strokeWidth={3.5} strokeDasharray="7 5" strokeLinejoin="round" opacity={0.7} />
      <path d={line(m)} fill="none" className="stroke-brand" strokeWidth={2.5} strokeLinejoin="round" />
    </svg>
  );
}
