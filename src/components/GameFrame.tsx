import { useState, type ReactNode } from 'react';
import { categoryOfUnit, unitById } from '../lib/content';
import { passRule } from '../lib/practice';
import type { Progress } from '../lib/types';
import { Cross } from './icons';
import type { LessonSummary } from './Lesson';
import { Bar, ConfirmDialog, Pill, type Tone } from './ui';

/** Props every game screen takes from the app. */
export interface GameProps {
  unitId: string;
  seed: number;
  progress: Progress;
  today: string;
  onProgress: (p: Progress) => void;
  onFinish: (summary: LessonSummary) => void;
  onQuit: () => void;
}

/**
 * The frame around a game: a leave button, a progress bar and a counter on top,
 * the unit's name, the rules (open until the first move, then one tap away),
 * and the pass rule at the bottom.
 */
export function GameFrame({
  unitId,
  done,
  total,
  counter,
  icon,
  tone = 'violet',
  rules,
  started,
  onQuit,
  children,
}: {
  unitId: string;
  done: number;
  total: number;
  counter: string;
  icon: ReactNode;
  tone?: Tone;
  rules: ReactNode;
  /** Once the learner has made a move, the rules fold away. */
  started: boolean;
  onQuit: () => void;
  children: ReactNode;
}) {
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const unit = unitById.get(unitId);
  const rulesOpen = !started || showRules;
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="mx-auto flex w-full max-w-xl lg:max-w-2xl items-center gap-3 px-4 pb-2 pt-4">
        <button
          type="button"
          onClick={() => setConfirmQuit(true)}
          className="rounded-xl p-2 text-ink-3 transition hover:bg-sunken hover:text-ink-2"
          aria-label="Leave game"
        >
          <Cross className="h-6 w-6" />
        </button>
        <Bar value={done} max={total} className="h-3" label="Game progress" />
        <span className="num w-24 shrink-0 text-right text-sm font-extrabold text-ink-2">{counter}</span>
      </header>

      <main className="mx-auto flex w-full max-w-xl lg:max-w-2xl flex-1 flex-col px-4 pb-6 pt-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <Pill tone={tone} icon={icon}>
            {unit?.name ?? 'Game'}
          </Pill>
          {started && (
            <button type="button" onClick={() => setShowRules((v) => !v)} className="text-sm font-extrabold text-ink-3 hover:text-ink-2" aria-expanded={rulesOpen}>
              {rulesOpen ? 'Hide rules' : 'How it works'}
            </button>
          )}
        </div>

        {rulesOpen && (
          <div className="mb-4 space-y-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed text-ink-2">
            <p className="font-extrabold text-ink">How it works</p>
            {rules}
          </div>
        )}

        {children}

        <p className="mt-auto pt-4 text-center text-xs text-ink-3">
          {categoryOfUnit(unitId)?.name} · {passRule(unitId)}
        </p>
      </main>

      {confirmQuit && (
        <ConfirmDialog
          title="Leave this game?"
          body="This game won't count. You can start a fresh one any time."
          confirmLabel="Leave"
          onConfirm={onQuit}
          onCancel={() => setConfirmQuit(false)}
        />
      )}
    </div>
  );
}

/** A full-width row of answer choices, styled like lesson options. */
export function Choices({ labels, picked, answer, onPick, mono = false }: { labels: string[]; picked: number | null; answer: number; onPick: (i: number) => void; mono?: boolean }) {
  const done = picked !== null;
  return (
    <div className="grid gap-3">
      {labels.map((opt, i) => {
        let style = 'border-line bg-surface text-ink shadow-press-line hover:bg-sunken/60 active:translate-y-[1px] active:shadow-none';
        if (done && i === answer) style = 'border-good bg-good-soft text-good-ink';
        else if (done && i === picked) style = 'animate-shake border-bad bg-bad-soft text-bad-ink';
        else if (done) style = 'border-line bg-surface text-ink-3 opacity-60';
        return (
          <button
            key={i}
            type="button"
            disabled={done}
            onClick={() => onPick(i)}
            className={`rounded-2xl border-2 px-4 py-3.5 text-left text-[15px] font-bold leading-snug transition ${style}`}
          >
            <span className={mono ? 'num font-mono text-[17px] font-semibold' : ''}>{opt}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The verdict panel after a move: green for right, red for wrong, with a Continue button. */
export function Verdict({ good, title, children, next, onNext }: { good: boolean; title: string; children?: ReactNode; next: string; onNext: () => void }) {
  return (
    <section aria-live="polite" className={`mt-4 animate-pop space-y-3 rounded-2xl p-4 ${good ? 'bg-good-soft' : 'bg-bad-soft'}`}>
      <p className={`text-lg font-extrabold ${good ? 'text-good-ink' : 'text-bad-ink'}`}>{title}</p>
      {children}
      <button
        type="button"
        onClick={onNext}
        className={`w-full rounded-2xl px-5 py-3.5 text-[15px] font-extrabold tracking-wide text-white transition active:translate-y-[2px] active:shadow-none bg-brand shadow-press`}
      >
        {next}
      </button>
    </section>
  );
}
