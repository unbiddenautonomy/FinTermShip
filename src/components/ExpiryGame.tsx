import { useMemo, useRef, useState } from 'react';
import { termById } from '../lib/content';
import {
  ACTION_LABEL,
  ACTIONS,
  act,
  clockAt,
  DAY_NAME,
  EXPIRY,
  eventAhead,
  heldPnl,
  markBook,
  minuteAt,
  newExpiryRound,
  openBook,
  playbook,
  playbookPath,
  premiumOf,
  scoreExpiry,
  signed,
  type Action,
  type Book,
  type Call,
  type Day,
  type Ruling,
} from '../lib/expiry';
import { finishGame } from '../lib/practice';
import { seededRng } from '../lib/questions';
import { Choices, GameFrame, Verdict, type GameProps } from './GameFrame';
import { Target } from './icons';

const TERMS = ['straddle', 'sell-premium', 'theta', 'gamma', 'delta-hedging', 'buy-wings', 'iron-butterfly', 'iv-crush', 'pin-risk', 'gamma-blast', 'event-risk', 'stop-loss'];

/** Points, signed, to one decimal at most. */
function pts(x: number, sign = true): string {
  const r = Math.round(x * 10) / 10;
  const s = Number.isInteger(r) ? String(Math.abs(r)) : Math.abs(r).toFixed(1);
  if (!sign) return r < 0 ? `−${s}` : s;
  return r > 0 ? `+${s}` : r < 0 ? `−${s}` : '0';
}
const nifty = (x: number) => Math.round(x).toLocaleString('en-IN');

interface DayLog {
  calls: Call[];
  pnl: number;
}

export function ExpiryGame({ unitId, seed, progress, today, onProgress, onFinish, onQuit }: GameProps) {
  const days = useMemo(() => newExpiryRound(seededRng(seed)), [seed]);
  const [dayIndex, setDayIndex] = useState(0);
  const [step, setStep] = useState(1);
  const [book, setBook] = useState<Book>(() => openBook(days[0]));
  const [logs, setLogs] = useState<DayLog[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [last, setLast] = useState<{ action: Action; ruling: Ruling } | null>(null);
  const finished = useRef(false);

  const day = days[dayIndex];
  const premium = premiumOf(day);
  const dayOver = book.closed || step > EXPIRY.checks.length;
  // Until the learner moves on, show the check they just called; after the day, the close.
  const shownStep = last ? step : dayOver ? EXPIRY.checks.length + 1 : step;
  const settled = shownStep > EXPIRY.checks.length;
  const mark = markBook(day, book, shownStep);
  const allCalls = [...logs.flatMap((l) => l.calls), ...calls];

  const pick = (i: number) => {
    if (last || dayOver) return;
    const action = ACTIONS[i];
    const ruling = playbook(day, book, step);
    setLast({ action, ruling });
    setCalls((c) => [...c, { day: dayIndex, step, action, ruling, right: ruling.ok.includes(action) }]);
    setBook(act(day, book, step, action));
  };

  const next = () => {
    setLast(null);
    setStep((s) => s + 1);
  };

  const finish = (all: DayLog[]) => {
    if (finished.current) return;
    finished.current = true;
    const flat = all.flatMap((l) => l.calls);
    const s = scoreExpiry(
      flat,
      all.map((l) => l.pnl),
    );
    const { progress: p, xp, firstPass } = finishGame(progress, unitId, today, s.right, s.passed, s.pnl);
    onProgress(p);
    const missed = flat.filter((c) => !c.right);
    onFinish({
      xp,
      firstTryCorrect: s.right,
      firstTryTotal: s.total,
      bestRun: 0,
      newIds: [],
      missedIds: [],
      kind: 'game',
      round: {
        unitId,
        kind: 'game',
        passed: s.passed,
        firstPass,
        detail: `${s.right} of ${s.total} calls by the playbook${s.musts ? `, ${s.mustTaken} of ${s.musts} must-do calls made` : ''}. Over three expiries you made ${pts(s.pnl)} points.`,
        stat: { label: 'Points', value: pts(s.pnl) },
        score: { label: 'by the playbook', short: 'Calls' },
        notes: [
          {
            title: 'The three days',
            items: days.map((d, i) => ({
              prompt: `Day ${i + 1}: ${DAY_NAME[d.kind]}. Sold the ${nifty(d.strike)} straddle for ${pts(premiumOf(d), false)}.`,
              shown: `You ${pts(all[i].pnl)}, the playbook ${pts(playbookPath(d).pnl)}, never touching it ${pts(heldPnl(d))}`,
            })),
          },
          ...(missed.length
            ? [
                {
                  title: 'Calls off the playbook',
                  items: missed.map((c) => ({
                    prompt: `Day ${c.day + 1}, ${clockAt(minuteAt(c.step))}: you chose ${ACTION_LABEL[c.action].toLowerCase()}${c.ruling.must ? ' (a must-do call)' : ''}`,
                    shown: c.ruling.why,
                  })),
                },
              ]
            : []),
          {
            title: 'What the days show',
            items: [
              { prompt: 'The quiet day', shown: 'Time decay is the seller’s income: on expiry day the straddle melts fastest in the last hours, and a market that pins to the big strike hands you nearly all of it.' },
              { prompt: 'The trending day', shown: 'Gamma is the seller’s risk: near expiry a small move swings delta hard. Hedging early and cutting late keeps one bad day from eating a month of premium.' },
              { prompt: 'RBI day', shown: 'Premium is rich before an event and collapses after it (IV crush). Wings cost a little of that, but cap the loss when the number surprises.' },
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

  const nextDay = () => {
    const log = { calls, pnl: markBook(day, book, EXPIRY.checks.length + 1).pnl };
    const all = [...logs, log];
    if (dayIndex + 1 >= days.length) {
      finish(all);
      return;
    }
    setLogs(all);
    setCalls([]);
    setDayIndex(dayIndex + 1);
    setStep(1);
    setBook(openBook(days[dayIndex + 1]));
    setLast(null);
  };

  const spot = day.spots[shownStep];
  const move = spot - day.spots[0];
  const minute = minuteAt(shownStep);
  const vol = day.vols[Math.min(shownStep, day.vols.length - 1)];
  const lastRuling = last?.ruling;
  const answer = last ? (lastRuling!.ok.includes(last.action) ? ACTIONS.indexOf(last.action) : ACTIONS.indexOf(lastRuling!.ok[0])) : 0;
  const dayRight = calls.filter((c) => c.right).length;

  return (
    <GameFrame
      unitId={unitId}
      done={dayIndex * EXPIRY.checks.length + Math.min(step - 1, EXPIRY.checks.length)}
      total={EXPIRY.days * EXPIRY.checks.length}
      counter={`Day ${dayIndex + 1} of ${EXPIRY.days}`}
      icon={<Target className="h-3.5 w-3.5" />}
      tone="amber"
      started={allCalls.length > 0}
      onQuit={onQuit}
      rules={
        <>
          <p>
            Three expiry days. Each morning at 9:15 you sell the at-the-money Nifty straddle (a call and a put at the same strike) and collect the premium. You check it six times,
            and whatever is left settles at 15:30 at what it's worth then. P&L is in Nifty points.
          </p>
          <p>The desk's playbook, first rule that applies:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Down half the premium or more: close everything.</li>
            <li>An event before the next check and no wings: buy wings (a call and a put {EXPIRY.wingGap} points out, which cap the loss).</li>
            <li>From 14:30: more than {EXPIRY.late} points from the strike, close everything; otherwise hold. Don't chase delta in the last hour.</li>
            <li>Before 14:30: delta beyond ±{EXPIRY.delta}, hedge it with futures.</li>
            <li>Otherwise hold, and let time decay work for you.</li>
          </ol>
          <p>
            Pass with {Math.round(EXPIRY.passShare * 100)}% of your calls by the playbook, and every stop and every pair of wings before an event taken. Near a line, either call
            counts.
          </p>
        </>
      }
    >
      <section aria-label="Your straddle" className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs font-extrabold uppercase tracking-wider text-ink-3">{settled ? 'Settled at 15:30' : `${clockAt(minute)} · ${EXPIRY.session - minute} min to the close`}</p>
          {!settled && <p className="num text-xs font-bold text-ink-3">IV {Math.round(vol * 100)}%</p>}
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-sm font-bold text-ink-3">Nifty</span>
          <span className="num text-3xl font-extrabold text-ink">{nifty(spot)}</span>
          <span className={`num text-sm font-bold ${move >= 0 ? 'text-good-ink' : 'text-bad-ink'}`}>{pts(Math.round(move))}</span>
        </div>
        <SpotChart day={day} upTo={shownStep} wings={book.wings} />
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-ink-3">Short {nifty(day.strike)} straddle</dt>
          <dd className="num text-right font-bold text-ink-2">
            sold {pts(premium, false)}, now {book.closed ? 'closed' : pts(mark.straddle, false)}
          </dd>
          {book.wings && (
            <>
              <dt className="text-ink-3">Wings {nifty(day.strike - EXPIRY.wingGap)} / {nifty(day.strike + EXPIRY.wingGap)}</dt>
              <dd className="num text-right font-bold text-ink-2">now {pts(mark.wings, false)}</dd>
            </>
          )}
          {book.futures !== 0 && !book.closed && (
            <>
              <dt className="text-ink-3">Futures hedge</dt>
              <dd className="num text-right font-bold text-ink-2">
                {book.futures > 0 ? 'long' : 'short'} {Math.abs(book.futures).toFixed(2)}
              </dd>
            </>
          )}
          {!settled && (
            <>
              <dt className="text-ink-3">Your delta</dt>
              <dd className="num text-right font-bold text-ink-2">{book.closed ? 'flat' : signed(mark.delta)}</dd>
            </>
          )}
          <dt className="font-bold text-ink-2">P&L</dt>
          <dd className={`num text-right text-base font-extrabold ${mark.pnl >= 0 ? 'text-good-ink' : 'text-bad-ink'}`}>{pts(mark.pnl)}</dd>
        </dl>
        {day.event && minute < day.event.minute && <p className="mt-2 rounded-xl bg-amber-soft px-3 py-2 text-sm font-bold text-amber-ink">{day.event.name} today.</p>}
        {step === 1 && !last && <p className="mt-2 text-sm text-ink-3">Biggest open interest: the {nifty(day.strike)} calls and puts.</p>}
      </section>

      {dayOver && !last ? (
        <Verdict
          good={dayRight >= Math.ceil(EXPIRY.passShare * calls.length) && calls.every((c) => !c.ruling.must || c.right)}
          title={DAY_NAME[day.kind]}
          next={dayIndex + 1 >= days.length ? 'See how you did' : 'Next expiry'}
          onNext={nextDay}
        >
          <p className="leading-relaxed text-ink-2">
            {dayRight} of {calls.length} calls by the playbook. Nifty settled at {nifty(day.spots[EXPIRY.checks.length + 1])}, {Math.round(Math.abs(day.spots[EXPIRY.checks.length + 1] - day.strike))} points
            from your strike. You made {pts(mark.pnl)}; the playbook made {pts(playbookPath(day).pnl)}, and never touching the straddle made {pts(heldPnl(day))}.
          </p>
        </Verdict>
      ) : last ? (
        <>
          <section className="mt-4" aria-label="Your call">
            <Choices labels={ACTIONS.map((a) => ACTION_LABEL[a])} picked={ACTIONS.indexOf(last.action)} answer={answer} onPick={() => {}} />
          </section>
          <Verdict good={lastRuling!.ok.includes(last.action)} title={lastRuling!.ok.includes(last.action) ? 'By the playbook' : 'Not the playbook'} next={book.closed || step >= EXPIRY.checks.length ? 'To the close' : 'Next check'} onNext={next}>
            <p className="leading-relaxed text-ink-2">{lastRuling!.why}</p>
          </Verdict>
        </>
      ) : (
        <section className="mt-4" aria-label="Your call">
          <p className="mb-2 text-sm font-bold text-ink-2">
            {eventAhead(day, step) ? `${day.event!.name}: ` : ''}What do you do at {clockAt(minute)}?
          </p>
          <Choices labels={ACTIONS.map((a) => (a === 'wings' && book.wings ? 'Buy wings (you have them)' : ACTION_LABEL[a]))} picked={null} answer={0} onPick={pick} />
        </section>
      )}
    </GameFrame>
  );
}

/** Nifty from 9:15 to now, with the strike and the wings marked. */
function SpotChart({ day, upTo, wings }: { day: Day; upTo: number; wings: boolean }) {
  const W = 320;
  const H = 120;
  const left = 6;
  const right = 46;
  const shown = day.spots.slice(0, upTo + 1);
  const lo = Math.min(day.strike - 150, ...shown) - 20;
  const hi = Math.max(day.strike + 150, ...shown) + 20;
  const x = (m: number) => left + (m / EXPIRY.session) * (W - left - right);
  const y = (v: number) => 6 + ((hi - v) / (hi - lo)) * (H - 12);
  const d = shown.map((v, i) => `${i ? 'L' : 'M'}${x(minuteAt(i)).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const lines: [number, string, string][] = [[day.strike, 'strike', 'stroke-ink-3']];
  if (wings) for (const k of [day.strike - EXPIRY.wingGap, day.strike + EXPIRY.wingGap]) if (k > lo && k < hi) lines.push([k, k > day.strike ? 'wing +200' : 'wing −200', 'stroke-amber']);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={`Nifty from 9:15 to ${clockAt(minuteAt(upTo))}, now ${Math.round(shown[shown.length - 1])}`}>
      <rect x={x(EXPIRY.lateFrom)} width={x(EXPIRY.session) - x(EXPIRY.lateFrom)} y={0} height={H} className="fill-sunken" />
      {lines.map(([v, label, cls]) => (
        <g key={label}>
          <line x1={left} x2={W - right} y1={y(v)} y2={y(v)} className={cls} strokeWidth={1} strokeDasharray={label === 'strike' ? undefined : '4 3'} />
          <text x={W - right + 3} y={y(v) + 3.5} className="fill-ink-3 text-[9px]">
            {label}
          </text>
        </g>
      ))}
      <text x={x(EXPIRY.lateFrom) + 3} y={12} className="fill-ink-3 text-[9px]">
        last hour
      </text>
      <path d={d} fill="none" className="stroke-amber" strokeWidth={2} strokeLinejoin="round" />
      {shown.map((v, i) => (i > 0 ? <circle key={i} cx={x(minuteAt(i))} cy={y(v)} r={2.5} className="fill-amber" /> : null))}
    </svg>
  );
}
