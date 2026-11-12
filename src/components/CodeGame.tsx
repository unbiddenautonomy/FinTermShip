import { useMemo, useRef, useState } from 'react';
import { termById } from '../lib/content';
import { CODE, CODE_COUNT, codePassed, newCodeRound } from '../lib/code';
import { finishGame } from '../lib/practice';
import { seededRng } from '../lib/questions';
import { Choices, GameFrame, Verdict, type GameProps } from './GameFrame';
import { Calculator } from './icons';

const TERMS = ['look-ahead-bias', 'survivorship-bias', 'point-in-time-data', 'data-leakage', 'adjusted-prices', 'transaction-costs', 'sharpe-ratio', 'annualised-volatility', 'max-drawdown', 'out-of-sample'];

export function CodeGame({ unitId, seed, progress, today, onProgress, onFinish, onQuit }: GameProps) {
  const round = useMemo(() => newCodeRound(seededRng(seed)), [seed]);
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);
  const finished = useRef(false);

  const q = round[index];
  const picked = picks.length > index ? picks[index] : null;
  const right = picks.filter((p, i) => p === round[i].answer).length;

  const finish = (all: number[]) => {
    if (finished.current) return;
    finished.current = true;
    const n = all.filter((p, i) => p === round[i].answer).length;
    const passed = codePassed(n);
    const { progress: p, xp, firstPass } = finishGame(progress, unitId, today, n, passed);
    onProgress(p);
    const missed = round.filter((r, i) => all[i] !== r.answer);
    onFinish({
      xp,
      firstTryCorrect: n,
      firstTryTotal: CODE_COUNT,
      bestRun: 0,
      newIds: [],
      missedIds: [],
      kind: 'game',
      round: {
        unitId,
        kind: 'game',
        passed,
        firstPass,
        detail: `${n} of ${CODE_COUNT} right.`,
        stat: { label: 'Right', value: `${n}/${CODE_COUNT}` },
        score: { label: 'right', short: 'Right' },
        notes: [
          ...(missed.length
            ? [
                {
                  title: 'The ones you missed',
                  items: missed.map((r) => ({ prompt: `${r.item.title}: ${r.item.options[0]}`, shown: r.item.why })),
                },
              ]
            : []),
          {
            title: 'The bugs that sink backtests',
            items: [
              { prompt: 'Look-ahead', shown: 'Anything set at today’s close can only earn tomorrow’s return. Shift signals, and normalise with past data only.' },
              { prompt: 'The wrong universe', shown: 'Test on the stocks that existed at each date, not today’s survivors.' },
              { prompt: 'Dirty prices', shown: 'Use prices adjusted for splits and bonuses, and fundamentals on the day they were published.' },
              { prompt: 'Flattering maths', shown: 'Compound returns by multiplying, annualise vol by √252, and charge costs on every trade.' },
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

  const next = () => {
    if (index + 1 >= round.length) finish(picks);
    else setIndex(index + 1);
  };

  return (
    <GameFrame
      unitId={unitId}
      done={picks.length}
      total={CODE_COUNT}
      counter={`${index + 1} of ${CODE_COUNT}`}
      icon={<Calculator className="h-3.5 w-3.5" />}
      tone="ink"
      started={picks.length > 0}
      onQuit={onQuit}
      rules={
        <>
          <p>
            {CODE_COUNT} short snippets of Python, pandas and NumPy, the tools a quant analyst uses every day. For {CODE.outputs} of them, say what the code prints. For the other{' '}
            {CODE.bugs}, find the bug that would make a backtest lie.
          </p>
          <p>
            Read the code line by line; no need to run anything. Pass with {CODE.passRight} of {CODE_COUNT} right.
          </p>
        </>
      }
    >
      <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-ink-3">
        {q.item.kind === 'bug' ? 'Spot the bug' : 'Predict the output'} · {q.item.title}
      </p>
      <pre className="overflow-x-auto rounded-2xl border border-line bg-sunken p-4 font-mono text-[13px] leading-relaxed text-ink">
        <code>{q.item.code}</code>
      </pre>
      <p className="mt-3 text-[15px] font-bold leading-snug text-ink">{q.item.ask}</p>
      <section className="mt-3" aria-label="Your answer">
        <Choices labels={q.options} picked={picked} answer={q.answer} onPick={(i) => picked === null && setPicks((p) => [...p, i])} mono={q.item.kind === 'output'} />
      </section>
      {picked !== null && (
        <Verdict good={picked === q.answer} title={picked === q.answer ? 'Right' : 'Not quite'} next={index + 1 >= round.length ? 'See how you did' : 'Next'} onNext={next}>
          <p className="leading-relaxed text-ink-2">{q.item.why}</p>
          <p className="num text-sm font-bold text-ink-3">
            {right} of {picks.length} right so far
          </p>
        </Verdict>
      )}
    </GameFrame>
  );
}
