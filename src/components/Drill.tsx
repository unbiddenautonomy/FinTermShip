import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { settleFocus } from '../lib/choose';
import { categoryOfUnit, unitById } from '../lib/content';
import { ANSWER_HINT, checkAnswer, clock, DRILLS, drillPasses, recordDrill } from '../lib/drills';
import { seededRng } from '../lib/questions';
import { finishLesson } from '../lib/scheduler';
import type { Progress } from '../lib/types';
import { Calculator, Check, Cross, Flame } from './icons';
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

const KEYS = ['7', '8', '9', 'back', '4', '5', '6', '/', '1', '2', '3', '%', '.', '0', '-', 'check'] as const;
const MAX_LENGTH = 12;

export function Drill({ unitId, seed, progress, today, onProgress, onFinish, onQuit }: Props) {
  const spec = DRILLS[unitId];
  const unit = unitById.get(unitId);
  const questions = useMemo(() => spec.make(seededRng(seed)), [spec, seed]);
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [state, setState] = useState<'ask' | 'right' | 'wrong'>('ask');
  const [hint, setHint] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [right, setRight] = useState(0);
  const [run, setRun] = useState({ now: 0, best: 0 });
  const [missed, setMissed] = useState<{ prompt: string; shown: string }[]>([]);
  const [confirmQuit, setConfirmQuit] = useState(false);
  /** Thinking time banked so far; the clock stops while feedback shows. */
  const banked = useRef(0);
  const askedAt = useRef(performance.now());
  const [shownMs, setShownMs] = useState(0);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  const q = questions[index];
  const target = spec.targetSec * 1000;

  useEffect(() => {
    if (state !== 'ask' || confirmQuit) return;
    askedAt.current = performance.now();
    const t = setInterval(() => setShownMs(banked.current + performance.now() - askedAt.current), 250);
    return () => {
      clearInterval(t);
      banked.current += performance.now() - askedAt.current;
    };
  }, [state, index, confirmQuit]);

  const finished = useRef(false);
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    const ms = Math.round(banked.current);
    const passed = drillPasses(unitId, right, ms);
    const before = progressRef.current.drills?.[unitId];
    let p = recordDrill(progressRef.current, unitId, right, ms, today);
    p = settleFocus(p);
    const xp = 5 + right + (passed ? 5 : 0);
    p = finishLesson(p, today, xp);
    onProgress(p);
    onFinish({
      xp,
      firstTryCorrect: right,
      firstTryTotal: questions.length,
      bestRun: run.best,
      newIds: [],
      missedIds: [],
      kind: 'drill',
      drill: { unitId, right, total: questions.length, ms, passed, firstPass: passed && !before?.passed, bestMs: p.drills?.[unitId]?.bestMs, missed },
    });
  }, [unitId, right, today, questions.length, run.best, missed, onProgress, onFinish]);

  const advance = useCallback(() => {
    if (index + 1 >= questions.length) {
      finish();
      return;
    }
    setIndex(index + 1);
    setInput('');
    setHint(null);
    setState('ask');
  }, [index, questions.length, finish]);

  const submit = useCallback(() => {
    if (state !== 'ask' || !input) return;
    const verdict = checkAnswer(q, input);
    if (verdict === 'unreadable' || verdict === 'fraction') {
      setHint(verdict === 'fraction' ? 'Type it as a decimal, such as 0.375.' : `${ANSWER_HINT[q.kind]}.`);
      setShake((n) => n + 1);
      return;
    }
    if (verdict === 'right') {
      setRight((n) => n + 1);
      setRun((r) => ({ now: r.now + 1, best: Math.max(r.best, r.now + 1) }));
      setState('right');
    } else {
      setRun((r) => ({ ...r, now: 0 }));
      setMissed((m) => [...m, { prompt: q.prompt, shown: q.shown }]);
      setState('wrong');
    }
  }, [state, input, q]);

  // A right answer moves on by itself; a wrong one waits so the working can be read.
  useEffect(() => {
    if (state !== 'right') return;
    const t = setTimeout(advance, 650);
    return () => clearTimeout(t);
  }, [state, advance]);

  const press = useCallback(
    (key: string) => {
      if (state !== 'ask') {
        if (key === 'check') advance();
        return;
      }
      setHint(null);
      if (key === 'check') submit();
      else if (key === 'back') setInput((s) => s.slice(0, -1));
      else setInput((s) => (s.length >= MAX_LENGTH ? s : s + key));
    },
    [state, submit, advance],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmQuit || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        press('check');
      } else if (e.key === 'Backspace') press('back');
      else if (/^[0-9./%-]$/.test(e.key)) press(e.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, confirmQuit]);

  const over = shownMs > target;
  const answered = state !== 'ask';

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="mx-auto flex w-full max-w-xl items-center gap-3 px-4 pb-2 pt-4">
        <button
          type="button"
          onClick={() => setConfirmQuit(true)}
          className="rounded-xl p-2 text-ink-3 transition hover:bg-sunken hover:text-ink-2"
          aria-label="Leave drill"
        >
          <Cross className="h-6 w-6" />
        </button>
        <Bar value={index + (answered ? 1 : 0)} max={questions.length} className="h-3" label="Drill progress" />
        <span className={`num w-24 shrink-0 text-right text-sm font-extrabold ${over ? 'text-amber-ink' : 'text-ink-2'}`} aria-label={`Time ${clock(shownMs)} of ${clock(target)}`}>
          {clock(shownMs)}
          <span className="font-semibold text-ink-3"> / {clock(target)}</span>
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pb-6 pt-4">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Pill tone="violet" icon={<Calculator className="h-3.5 w-3.5" />}>
            {unit?.name ?? 'Drill'}
          </Pill>
          <span className="num text-xs font-bold text-ink-3">
            {index + 1} of {questions.length}
          </span>
          {run.now >= 2 && (
            <span className="num ml-auto inline-flex items-center gap-0.5 text-sm font-extrabold text-amber" aria-label={`${run.now} in a row`}>
              <Flame className="h-4 w-4" />
              {run.now}
            </span>
          )}
        </div>

        <p key={index} className="animate-pop text-2xl font-extrabold leading-snug tracking-tight text-ink sm:text-[28px]">
          {q.prompt}
        </p>

        <div
          key={`a${shake}`}
          className={`mt-6 flex min-h-[64px] items-center rounded-2xl border-2 px-4 ${shake ? 'animate-shake' : ''} ${
            state === 'right' ? 'border-good bg-good-soft' : state === 'wrong' ? 'border-bad bg-bad-soft' : 'border-line bg-surface'
          }`}
        >
          <output aria-label="Your answer" aria-live="polite" className="num flex-1 font-mono text-[28px] font-semibold text-ink">
            {input.replace(/-/g, '−') || <span className="font-sans text-base font-semibold text-ink-3">{ANSWER_HINT[q.kind]}</span>}
          </output>
          {state === 'right' && <Check className="h-7 w-7 text-good" />}
          {state === 'wrong' && <Cross className="h-7 w-7 text-bad" />}
        </div>
        {hint && (
          <p className="mt-2 text-sm font-bold text-bad-ink" role="alert">
            {hint}
          </p>
        )}

        {state === 'wrong' ? (
          <div className="mt-4 space-y-3 rounded-2xl bg-bad-soft p-4" role="status">
            <p className="text-lg font-extrabold text-bad-ink">Answer: {q.shown}</p>
            <p className="leading-relaxed text-ink-2">{q.why}</p>
            <Button variant="danger" className="w-full" onClick={advance}>
              Continue
            </Button>
          </div>
        ) : (
          <div className="mt-auto grid grid-cols-4 gap-2 pt-6" aria-label="Keypad">
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => press(k)}
                disabled={answered}
                aria-label={k === 'back' ? 'Delete' : k === 'check' ? 'Check' : k === '-' ? 'Minus' : k}
                className={`num flex h-14 items-center justify-center rounded-2xl text-xl font-extrabold transition active:translate-y-[1px] disabled:opacity-50 ${
                  k === 'check'
                    ? 'bg-brand text-white shadow-press active:shadow-none'
                    : /[0-9.]/.test(k)
                      ? 'border border-line bg-surface text-ink shadow-press-line active:shadow-none'
                      : 'bg-sunken text-ink-2'
                }`}
              >
                {k === 'back' ? '⌫' : k === 'check' ? <Check className="h-6 w-6" /> : k === '-' ? '−' : k}
              </button>
            ))}
          </div>
        )}
        <p className="mt-3 text-center text-xs text-ink-3">
          {categoryOfUnit(unitId)?.name} · pass with {spec.passRight} of {questions.length} right in under {clock(target)}
        </p>
      </main>

      {confirmQuit && (
        <ConfirmDialog
          title="Leave this drill?"
          body="This round won't count. You can start a fresh one any time."
          confirmLabel="Leave"
          onConfirm={onQuit}
          onCancel={() => setConfirmQuit(false)}
        />
      )}
    </div>
  );
}
