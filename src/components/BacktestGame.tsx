import { useMemo, useRef, useState } from 'react';
import { BACKTEST, BACKTEST_POINTS, backtestPassed, FLAWS, newBacktestRound, SLOTS } from '../lib/backtest';
import { termById } from '../lib/content';
import { finishGame } from '../lib/practice';
import { seededRng } from '../lib/questions';
import { Choices, GameFrame, Verdict, type GameProps } from './GameFrame';
import { Search } from './icons';

interface Answer {
  line: number;
  name: number | null;
}

export function BacktestGame({ unitId, seed, progress, today, onProgress, onFinish, onQuit }: GameProps) {
  const cases = useMemo(() => newBacktestRound(seededRng(seed)), [seed]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const finished = useRef(false);

  const c = cases[index];
  const a: Answer | undefined = answers[index];
  const found = a ? a.line === c.answer : false;
  const named = a?.name != null ? c.names[a.name] === c.flaw : false;
  const done = a?.name != null;
  const points = answers.reduce((n, x, i) => n + (x.line === cases[i].answer ? 1 : 0) + (x.name != null && cases[i].names[x.name] === cases[i].flaw ? 1 : 0), 0);

  const pickLine = (i: number) => {
    if (a) return;
    setAnswers((all) => [...all, { line: i, name: null }]);
  };
  const pickName = (i: number) => {
    if (!a || a.name != null) return;
    setAnswers((all) => all.map((x, k) => (k === index ? { ...x, name: i } : x)));
  };

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    const passed = backtestPassed(points);
    const { progress: p, xp, firstPass } = finishGame(progress, unitId, today, points, passed);
    onProgress(p);
    const flawsFound = answers.filter((x, i) => x.line === cases[i].answer).length;
    onFinish({
      xp,
      firstTryCorrect: points,
      firstTryTotal: BACKTEST_POINTS,
      bestRun: 0,
      newIds: [],
      missedIds: [],
      kind: 'game',
      round: {
        unitId,
        kind: 'game',
        passed,
        firstPass,
        detail: `${points} of ${BACKTEST_POINTS} points: a point for each flaw found and each one named.${passed ? '' : ` To pass: ${BACKTEST.passPoints}.`}`,
        stat: { label: 'Flaws found', value: `${flawsFound} of ${cases.length}` },
        score: { label: 'points', short: 'Points' },
        notes: [
          {
            title: 'The reports',
            items: cases.map((k, i) => {
              const x = answers[i];
              const f = x?.line === k.answer;
              const n = x?.name != null && k.names[x.name] === k.flaw;
              return { prompt: `${k.strategy.title}: ${FLAWS[k.flaw].name.toLowerCase()}`, shown: f && n ? 'Found and named' : f ? 'Found, not named' : n ? 'Named, not found' : 'Missed' };
            }),
          },
          {
            title: 'What to say in the review',
            items: cases.map((k) => ({ prompt: FLAWS[k.flaw].name, shown: FLAWS[k.flaw].say })),
          },
          {
            title: 'The terms',
            items: cases
              .map((k) => termById.get(FLAWS[k.flaw].term))
              .filter((t) => t !== undefined)
              .map((t) => ({ prompt: t.term, shown: t.short })),
          },
        ],
      },
    });
  };

  const next = () => {
    if (index + 1 >= cases.length) finish();
    else setIndex(index + 1);
  };

  return (
    <GameFrame
      unitId={unitId}
      done={answers.filter((x) => x.name != null).length}
      total={cases.length}
      counter={`Report ${index + 1} of ${cases.length}`}
      icon={<Search className="h-3.5 w-3.5" />}
      tone="sky"
      started={answers.length > 0 || index > 0}
      onQuit={onQuit}
      rules={
        <>
          <p>
            Six backtest reports, each one looking too good, and each with <b>exactly one flaw</b>. Read the six lines of the write-up, tap the one that gives it away, then name the flaw.
          </p>
          <p>
            A point for finding it and a point for naming it: pass with {BACKTEST.passPoints} of {BACKTEST_POINTS}. The flaws are the ones a research review catches: look-ahead, survivorship, missing costs, overfitting, data snooping, a small sample, bad data, and returns that are just the market.
          </p>
        </>
      }
    >
      <section aria-label="The backtest report" className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <p className="text-xs font-extrabold uppercase tracking-wider text-ink-3">Backtest report</p>
        <p className="text-lg font-extrabold text-ink">{c.strategy.title}</p>
        <p className="mt-1 text-sm leading-snug text-ink-2">{c.strategy.about}</p>
        <dl className="mt-3 grid grid-cols-3 gap-2">
          <Stat label="Sharpe" value={c.stats.sharpe.toFixed(1)} />
          <Stat label="A year" value={`${c.stats.annual}%`} />
          <Stat label="Worst fall" value={`${c.stats.drawdown}%`} />
        </dl>
      </section>

      <p className="mb-2 mt-4 text-lg font-extrabold text-ink">{a ? 'The giveaway' : 'Which line gives it away?'}</p>
      <ol className="grid gap-2" aria-label="The write-up">
        {c.lines.map((l, i) => {
          let style = 'border-line bg-surface shadow-press-line hover:bg-sunken/60 active:translate-y-[1px] active:shadow-none';
          if (a && i === c.answer) style = 'border-good bg-good-soft';
          else if (a && i === a.line) style = 'animate-shake border-bad bg-bad-soft';
          else if (a) style = 'border-line bg-surface opacity-60';
          return (
            <li key={l.slot}>
              <button type="button" disabled={!!a} onClick={() => pickLine(i)} className={`w-full rounded-2xl border-2 px-4 py-2.5 text-left transition ${style}`}>
                <span className="block text-[11px] font-extrabold uppercase tracking-wider text-ink-3">{SLOTS[l.slot]}</span>
                <span className="block text-[15px] font-bold leading-snug text-ink">{l.text}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {a && (
        <section aria-label="Name the flaw" className="mt-4 space-y-3">
          <p className="text-lg font-extrabold leading-snug text-ink">{found ? 'Found it. What is the flaw called?' : 'That line was fine. What is the flaw in the green one called?'}</p>
          <Choices labels={c.names.map((f) => FLAWS[f].name)} picked={a.name} answer={c.names.indexOf(c.flaw)} onPick={pickName} />
        </section>
      )}

      {done && (
        <Verdict
          good={found && named}
          title={found && named ? 'Case closed' : found || named ? 'Half right' : 'Missed this one'}
          next={index + 1 >= cases.length ? 'See how you did' : 'Next report'}
          onNext={next}
        >
          <p className="leading-relaxed text-ink-2">
            <b className="text-ink">{FLAWS[c.flaw].name}.</b> {c.why}
          </p>
          <p className="leading-relaxed text-ink-2">
            In the review: <i>“{FLAWS[c.flaw].say}”</i>
          </p>
        </Verdict>
      )}
    </GameFrame>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-sunken px-2 py-2 text-center">
      <dt className="text-[11px] font-bold text-ink-3">{label}</dt>
      <dd className="num text-xl font-extrabold text-ink">{value}</dd>
    </div>
  );
}
