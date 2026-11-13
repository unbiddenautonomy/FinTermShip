import { useMemo, useRef, useState } from 'react';
import { glossOrUnit, termById } from '../lib/content';
import { finishGame } from '../lib/practice';
import { seededRng } from '../lib/questions';
import {
  crore,
  explain,
  judge,
  LIMIT_LABEL,
  LIMITS,
  maxPoints,
  newRiskGame,
  positionText,
  RISK,
  scoreRisk,
  type Answer,
  type Limit,
  type Metrics,
} from '../lib/risk';
import { Choices, GameFrame, Verdict, type GameProps } from './GameFrame';
import { Scale } from './icons';

const TERMS = ['gross-exposure', 'net-exposure', 'var', 'position-limit', 'limit-breach', 'concentration-risk', 'margin', 'hedge', 'de-gross', 'bring-net-down', 'risk-budget', 'beta'];
const DECISIONS = ['Approve', 'Reject'];
const L = RISK.limits;

function verdictTitle(a: Answer, breaches: Limit[]): string {
  if (!a.right) return a.decision === 'approve' ? 'That breaks a limit' : 'That one was inside every limit';
  if (a.decision === 'approve') return 'Approved: inside every limit';
  if (a.named) return breaches.length > 1 ? 'Rejected, and a limit it breaks' : 'Rejected, and the right limit';
  return `Rejected, but it's the ${breaches.map((l) => LIMIT_LABEL[l].toLowerCase()).join(' and the ')} limit`;
}

export function RiskGame({ unitId, seed, progress, today, onProgress, onFinish, onQuit }: GameProps) {
  const game = useMemo(() => newRiskGame(seededRng(seed)), [seed]);
  const [index, setIndex] = useState(0);
  const [rejecting, setRejecting] = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const finished = useRef(false);

  const c = game.cases[index];
  const answer = answers.length > index ? answers[index] : null;
  const max = maxPoints(game.cases);

  const decide = (decision: 'approve' | 'reject', limit: Limit | null) => {
    setRejecting(false);
    setAnswers((a) => [...a, judge(c, index, decision, limit)]);
  };

  const finish = (all: Answer[]) => {
    if (finished.current) return;
    finished.current = true;
    const s = scoreRisk(game.cases, all);
    const { progress: p, xp, firstPass } = finishGame(progress, unitId, today, s.points, s.passed);
    onProgress(p);
    onFinish({
      xp,
      firstTryCorrect: s.points,
      firstTryTotal: s.max,
      bestRun: 0,
      newIds: [],
      missedIds: [],
      kind: 'game',
      round: {
        unitId,
        kind: 'game',
        passed: s.passed,
        firstPass,
        detail: `${s.right} of ${game.cases.length} calls right and ${s.named} of ${s.breaches} breaches named${s.approvedBreaches ? `. You approved ${s.approvedBreaches} trade${s.approvedBreaches === 1 ? '' : 's'} that broke a limit` : ''}.`,
        stat: { label: 'Points', value: `${s.points}/${s.max}` },
        score: { label: 'points', short: 'Points' },
        notes: [
          {
            title: 'The requests',
            items: game.cases.map((rc, i) => ({
              prompt: `${i + 1}. ${rc.request.text} You ${all[i].decision === 'approve' ? 'approved' : 'rejected'}${all[i].right ? '' : ' (wrong call)'}.`,
              shown: explain(rc),
            })),
          },
          {
            title: 'What risk looks at',
            items: [
              { prompt: 'Gross and net', shown: 'Gross is the size of the book, every position added up. Net is the bet on the market. A hedge cuts net but adds gross; a pair adds gross but leaves net alone.' },
              { prompt: 'Single stock', shown: 'Concentration limits stop one name from sinking the book on a bad result or a fraud.' },
              { prompt: 'VaR', shown: 'One-day 99% VaR is the loss the book should beat on 99 days in 100. It depends on how positions move together, so it doesn’t add up position by position.' },
              { prompt: 'Margin', shown: 'Shorts and futures tie up margin. Run out of margin room and the desk can’t hedge when it needs to.' },
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
    if (index + 1 >= game.cases.length) {
      finish(answers);
      return;
    }
    setIndex(index + 1);
  };

  const points = answers.reduce((a, b) => a + b.points, 0);

  return (
    <GameFrame
      unitId={unitId}
      done={answers.length}
      total={game.cases.length}
      counter={`${Math.min(index + 1, game.cases.length)} of ${game.cases.length}`}
      icon={<Scale className="h-3.5 w-3.5" />}
      tone="sky"
      started={answers.length > 0 || rejecting}
      onQuit={onQuit}
      rules={
        <>
          <p>
            You're the risk manager for a long-short equity book with a Nifty futures hedge. {RISK.requests} trade requests come in. Approve the ones that keep the book inside every
            limit, and reject the ones that break one. When you reject, say which limit.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Gross exposure: every position added up, long or short, at most {crore(L.gross)}.</li>
            <li>
              Net exposure: longs minus shorts, futures included, between {crore(L.netLow, true)} and {crore(L.netHigh, true)}.
            </li>
            <li>Single stock: no name bigger than {crore(L.name)}, long or short.</li>
            <li>VaR, one day at 99%: at most {crore(L.var)}. The risk system shows it for each trade.</li>
            <li>
              Margin: {Math.round(RISK.shortMargin * 100)}% of shorts plus {Math.round(RISK.futuresMargin * 100)}% of futures, at most {crore(L.margin)}. Longs are paid in cash.
            </li>
          </ul>
          <p>
            A point for each right call and a point for naming the limit. Pass with {max - RISK.dropAllowed} of {max} and no breach approved.
          </p>
        </>
      }
    >
      <BookPanel m={c.before} />

      <section aria-label="The request" className="mt-4 rounded-2xl border border-line bg-surface p-4 shadow-card">
        <p className="text-xs font-extrabold uppercase tracking-wider text-ink-3">Request {index + 1}</p>
        <p className="mt-1 text-[15px] font-bold leading-snug text-ink">{c.request.text}</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {c.request.trades.map((t) => (
            <div key={t.name} className="contents">
              <dt className="text-ink-3">{t.name} now</dt>
              <dd className="num text-right font-bold text-ink-2">{positionText(c.book, t.name)}</dd>
            </div>
          ))}
          <dt className="text-ink-3">Risk system: VaR after</dt>
          <dd className="num text-right font-bold text-ink-2">{crore(c.after.var)}</dd>
        </dl>
      </section>

      {answer ? (
        <>
          <section className="mt-4" aria-label="Your call">
            <Choices labels={DECISIONS} picked={answer.decision === 'approve' ? 0 : 1} answer={c.breaches.length ? 1 : 0} onPick={() => {}} />
          </section>
          {answer.decision === 'reject' && answer.limit && c.breaches.length > 0 && (
            <section className="mt-3" aria-label="The limit you named">
              <Choices labels={LIMITS.map((l) => LIMIT_LABEL[l])} picked={LIMITS.indexOf(answer.limit)} answer={LIMITS.indexOf(answer.named ? answer.limit : c.breaches[0])} onPick={() => {}} />
            </section>
          )}
          <Verdict good={answer.right} title={verdictTitle(answer, c.breaches)} next={index + 1 >= game.cases.length ? 'See how you did' : 'Next request'} onNext={next}>
            <p className="leading-relaxed text-ink-2">{explain(c)}</p>
            {!answer.right && (
              <p className="leading-relaxed text-ink-2">
                {answer.decision === 'approve' ? 'Risk catches it at the end of the day and the desk unwinds it.' : 'The head of desk signs it off over your head.'}
              </p>
            )}
            <p className="num text-sm font-bold text-ink-3">
              {points} of {max} points so far
            </p>
          </Verdict>
        </>
      ) : rejecting ? (
        <section className="mt-4" aria-label="Which limit">
          <p className="mb-2 text-sm font-bold text-ink-2">Which limit does it break? If it breaks two, either counts.</p>
          <Choices labels={LIMITS.map((l) => LIMIT_LABEL[l])} picked={null} answer={0} onPick={(i) => decide('reject', LIMITS[i])} />
          <button type="button" onClick={() => setRejecting(false)} className="mt-3 w-full text-center text-sm font-extrabold text-ink-3 hover:text-ink-2">
            Back
          </button>
        </section>
      ) : (
        <section className="mt-4" aria-label="Your call">
          <p className="mb-2 text-sm font-bold text-ink-2">Approve or reject?</p>
          <Choices labels={DECISIONS} picked={null} answer={0} onPick={(i) => (i === 0 ? decide('approve', null) : setRejecting(true))} />
        </section>
      )}
    </GameFrame>
  );
}

/** The book against its limits, before the request. */
function BookPanel({ m }: { m: Metrics }) {
  const rows: { label: string; value: string; limit: string; used: number }[] = [
    { label: 'Gross', value: crore(m.gross), limit: crore(L.gross), used: m.gross / L.gross },
    { label: 'Net', value: crore(m.net, true), limit: `${crore(L.netLow, true)} to ${crore(L.netHigh, true)}`, used: m.net >= 0 ? m.net / L.netHigh : m.net / L.netLow },
    { label: `Biggest name (${m.nameId})`, value: crore(m.name), limit: crore(L.name), used: m.name / L.name },
    { label: 'Margin', value: crore(m.margin), limit: crore(L.margin), used: m.margin / L.margin },
    { label: 'VaR, 1 day 99%', value: crore(m.var), limit: crore(L.var), used: m.var / L.var },
  ];
  return (
    <section aria-label="The book" className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <p className="text-xs font-extrabold uppercase tracking-wider text-ink-3">The book now</p>
      <dl className="mt-2 space-y-2 text-sm">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-3">{r.label}</dt>
              <dd className="num font-bold text-ink-2">
                {r.value} <span className="font-normal text-ink-3">/ {r.limit}</span>
              </dd>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
              <div className={`h-full rounded-full ${r.used > 0.9 ? 'bg-amber' : 'bg-sky'}`} style={{ width: `${Math.min(100, Math.max(0, r.used * 100))}%` }} />
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}
