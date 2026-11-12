import { useMemo, useRef, useState } from 'react';
import { settleFocus } from '../lib/choose';
import { caseById, categoryOfUnit, termName, unitById } from '../lib/content';
import { casePassMark, passRule, recordRound } from '../lib/practice';
import { seededRng, shuffle } from '../lib/questions';
import { finishLesson } from '../lib/scheduler';
import type { Progress } from '../lib/types';
import { Briefcase, Check, Cross } from './icons';
import type { LessonSummary } from './Lesson';
import { Bar, Button, ConfirmDialog, Pill } from './ui';

interface Props {
  unitId: string;
  seed: number;
  progress: Progress;
  today: string;
  onProgress: (p: Progress) => void;
  onFinish: (summary: LessonSummary) => void;
  onQuit: () => void;
}

export function DeskCase({ unitId, seed, progress, today, onProgress, onFinish, onQuit }: Props) {
  const story = caseById.get(unitId)!;
  const unit = unitById.get(unitId);
  // Options are shuffled once per go, so the best one isn't always in the same place.
  const steps = useMemo(() => {
    const rng = seededRng(seed);
    return story.steps.map((s) => ({ ...s, options: shuffle(s.options, rng) }));
  }, [story, seed]);
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const finished = useRef(false);

  const step = steps[index];
  const picked = picks[index];
  const answered = picked !== undefined;
  const best = step.options.findIndex((o) => o.best);
  const right = picks.filter((p, i) => steps[i].options[p]?.best).length;

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    const total = steps.length;
    const passed = right >= casePassMark(unitId);
    const before = progress.drills?.[unitId];
    let p = recordRound(progress, unitId, right, passed, today);
    p = settleFocus(p);
    const xp = 5 + right + (passed ? 5 : 0);
    p = finishLesson(p, today, xp);
    onProgress(p);
    const missed = steps.filter((s, i) => !s.options[picks[i]]?.best);
    onFinish({
      xp,
      firstTryCorrect: right,
      firstTryTotal: total,
      bestRun: 0,
      newIds: [],
      missedIds: [],
      kind: 'case',
      round: {
        unitId,
        kind: 'case',
        passed,
        firstPass: passed && !before?.passed,
        detail: `${right} of ${total} best calls. To pass: ${casePassMark(unitId)}.`,
        stat: { label: 'Best calls', value: `${right}/${total}` },
        notes: missed.length
          ? [{ title: 'Decisions to revisit', items: missed.map((s) => ({ prompt: s.ask, shown: s.options.find((o) => o.best)!.text })) }]
          : [],
      },
    });
  };

  const next = () => {
    if (index + 1 >= steps.length) finish();
    else setIndex(index + 1);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="mx-auto flex w-full max-w-xl lg:max-w-2xl items-center gap-3 px-4 pb-2 pt-4">
        <button
          type="button"
          onClick={() => setConfirmQuit(true)}
          className="rounded-xl p-2 text-ink-3 transition hover:bg-sunken hover:text-ink-2"
          aria-label="Leave case"
        >
          <Cross className="h-6 w-6" />
        </button>
        <Bar value={index + (answered ? 1 : 0)} max={steps.length} className="h-3" label="Case progress" />
        <span className="num w-16 shrink-0 text-right text-sm font-extrabold text-ink-2">
          {index + 1} of {steps.length}
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-xl lg:max-w-2xl flex-1 flex-col px-4 pb-6 pt-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Pill tone="violet" icon={<Briefcase className="h-3.5 w-3.5" />}>
            Desk case
          </Pill>
          <span className="text-xs font-bold text-ink-3">{unit?.name.replace(/^Case: /, '')}</span>
        </div>

        {index === 0 ? (
          <section className="mb-4 rounded-2xl border border-line bg-surface p-4 shadow-card">
            <p className="leading-relaxed text-ink-2">{story.setup}</p>
            <Facts facts={story.facts} />
          </section>
        ) : (
          <details className="mb-4 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
            <summary className="cursor-pointer font-bold text-ink-2">The setup</summary>
            <p className="mt-2 leading-relaxed text-ink-2">{story.setup}</p>
            <Facts facts={story.facts} />
          </details>
        )}

        <div key={index} className="animate-pop">
          {step.text && <p className="leading-relaxed text-ink-2">{step.text}</p>}
          <p className="mt-3 text-xl font-extrabold leading-snug tracking-tight text-ink">{step.ask}</p>

          <div className="mt-4 space-y-2.5">
            {step.options.map((o, i) => {
              const isPick = picked === i;
              const isBest = i === best;
              const tone = !answered
                ? 'border-line bg-surface hover:border-brand/50'
                : isBest
                  ? 'border-good bg-good-soft'
                  : isPick
                    ? 'border-bad bg-bad-soft'
                    : 'border-line bg-surface opacity-60';
              return (
                <button
                  key={i}
                  type="button"
                  disabled={answered}
                  onClick={() => setPicks((p) => [...p.slice(0, index), i])}
                  className={`flex w-full items-start gap-3 rounded-2xl border-2 px-4 py-3 text-left transition active:scale-[0.99] ${tone}`}
                >
                  <span className="flex-1 font-semibold text-ink">{o.text}</span>
                  {answered && isBest && <Check className="mt-0.5 h-5 w-5 shrink-0 text-good" />}
                  {answered && isPick && !isBest && <Cross className="mt-0.5 h-5 w-5 shrink-0 text-bad" />}
                </button>
              );
            })}
          </div>

          {answered && (
            <div className="mt-4 space-y-3" role="status">
              <div className={`rounded-2xl p-4 ${step.options[picked].best ? 'bg-good-soft' : 'bg-bad-soft'}`}>
                <p className={`font-extrabold ${step.options[picked].best ? 'text-good-ink' : 'text-bad-ink'}`}>{step.options[picked].best ? 'Good call' : 'Not the best call'}</p>
                <p className="mt-1 leading-relaxed text-ink-2">{step.options[picked].why}</p>
                {!step.options[picked].best && <p className="mt-2 leading-relaxed text-ink-2">{step.options[best].why}</p>}
              </div>
              {step.terms.length > 0 && (
                <p className="text-sm text-ink-3">
                  Terms in play: <span className="font-semibold text-ink-2">{step.terms.map(termName).join(', ')}</span>
                </p>
              )}
              <Button className="w-full text-base" onClick={next}>
                {index + 1 >= steps.length ? 'See how you did' : 'Continue'}
              </Button>
            </div>
          )}
        </div>

        <p className="mt-auto pt-6 text-center text-xs text-ink-3">
          {categoryOfUnit(unitId)?.name} · {passRule(unitId)} of {steps.length}
        </p>
      </main>

      {confirmQuit && (
        <ConfirmDialog
          title="Leave this case?"
          body="This go won't count. You can start the case again any time."
          confirmLabel="Leave"
          onConfirm={onQuit}
          onCancel={() => setConfirmQuit(false)}
        />
      )}
    </div>
  );
}

function Facts({ facts }: { facts: string[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {facts.map((f) => (
        <li key={f} className="num rounded-full bg-sunken px-3 py-1 text-xs font-bold text-ink-2">
          {f}
        </li>
      ))}
    </ul>
  );
}
