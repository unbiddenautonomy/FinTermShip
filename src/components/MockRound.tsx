import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ANSWER_HINT, checkAnswer, clock } from '../lib/drills';
import { isRight, mockByRound, mockReady, MOCK_READY, newMock, recordMock, type MockAnswer, type MockQuestion } from '../lib/mock';
import { comma } from '../lib/profile';
import { seededRng } from '../lib/questions';
import type { Progress } from '../lib/types';
import { Briefcase, Check, Cross } from './icons';
import { Bar, Button, Card, ConfirmDialog, Pill } from './ui';

interface Props {
  round: string;
  progress: Progress;
  today: string;
  onProgress: (p: Progress) => void;
  onBack: () => void;
}

type Phase = 'intro' | 'run' | 'done';

/** A timed mock of one interview round: one clock, no feedback until the end. */
export function MockRound({ round, progress, today, onProgress, onBack }: Props) {
  const spec = mockByRound.get(round)!;
  const [seed, setSeed] = useState(() => Date.now() % 2_147_483_647);
  const questions = useMemo(() => newMock(spec, seededRng(seed)), [spec, seed]);
  const [phase, setPhase] = useState<Phase>('intro');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<MockAnswer[]>([]);
  const [input, setInput] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [left, setLeft] = useState(spec.minutes * 60_000);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const endsAt = useRef(0);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const best = progress.mocks?.[round];

  const finish = useCallback(
    (all: MockAnswer[]) => {
      const full = questions.map((_, i) => all[i] ?? null);
      setAnswers(full);
      const right = questions.filter((q, i) => isRight(q, full[i])).length;
      onProgress(recordMock(progressRef.current, round, right, questions.length, today));
      setPhase('done');
    },
    [questions, round, today, onProgress],
  );

  const start = () => {
    setIndex(0);
    setAnswers([]);
    setInput('');
    setPicked(null);
    setHint(null);
    endsAt.current = performance.now() + spec.minutes * 60_000;
    setLeft(spec.minutes * 60_000);
    setPhase('run');
  };

  // The clock keeps running while the leave dialog is open, as it would in the room.
  const answersRef = useRef(answers);
  answersRef.current = answers;
  useEffect(() => {
    if (phase !== 'run') return;
    const t = setInterval(() => {
      const ms = endsAt.current - performance.now();
      if (ms <= 0) {
        clearInterval(t);
        setLeft(0);
        finish(answersRef.current);
      } else setLeft(ms);
    }, 250);
    return () => clearInterval(t);
  }, [phase, finish]);

  const q = questions[index];

  const next = (answer: MockAnswer) => {
    const all = [...answers];
    all[index] = answer;
    setAnswers(all);
    setInput('');
    setPicked(null);
    setHint(null);
    if (index + 1 >= questions.length) finish(all);
    else setIndex(index + 1);
  };

  const submit = () => {
    if (q.kind === 'typed') {
      if (!input.trim()) return;
      const v = checkAnswer(q.drill, input);
      if (v === 'unreadable') return setHint(`${ANSWER_HINT[q.drill.kind]}.`);
      if (v === 'fraction') return setHint('Type it as a decimal, such as 0.375.');
      next(input.trim());
    } else if (picked !== null) next(picked);
  };

  if (phase === 'intro') {
    return (
      <div className="mx-auto max-w-xl lg:max-w-2xl space-y-5 px-4 pb-32 pt-5">
        <button type="button" onClick={onBack} className="rounded-xl px-2 py-1.5 text-sm font-extrabold text-brand-ink transition hover:bg-sunken">
          ← Back
        </button>
        <div className="px-1">
          <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-violet-ink">
            <Briefcase className="h-4 w-4" />
            Timed mock round
          </p>
          <h1 className="mt-1 text-2xl font-display font-semibold tracking-tight text-ink">{round}</h1>
          <p className="mt-2 leading-relaxed text-ink-2">{spec.about}</p>
        </div>
        <Card className="space-y-2">
          <p className="font-extrabold text-ink">
            {questions.length} questions · {spec.minutes} minutes
          </p>
          <p className="text-sm leading-relaxed text-ink-2">
            One clock for the whole round and no marks until the end, like the real thing. You can skip a question; skipped and unanswered questions count as wrong. Get{' '}
            {Math.round(MOCK_READY * 100)}% to count as interview-ready.
          </p>
          {best && (
            <p className="num text-sm font-bold text-ink-3">
              Best: {best.best} of {best.total}
              {mockReady(best.best, best.total) ? ' · ready' : ''} · {best.tries} {best.tries === 1 ? 'try' : 'tries'}
            </p>
          )}
        </Card>
        <Button className="w-full" onClick={start}>
          Start the clock
        </Button>
      </div>
    );
  }

  if (phase === 'done') {
    const right = questions.filter((qq, i) => isRight(qq, answers[i])).length;
    const ready = mockReady(right, questions.length);
    return (
      <div className="mx-auto max-w-xl lg:max-w-2xl space-y-5 px-4 pb-32 pt-5">
        <div className={`rounded-2xl p-5 ${ready ? 'bg-good-soft' : 'bg-amber-soft'}`} role="status">
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-ink-3">{round} · mock</p>
          <p className="num mt-1 text-3xl font-extrabold text-ink">
            {right} of {questions.length}
          </p>
          <p className="mt-1 font-bold text-ink-2">
            {ready ? `Interview-ready on this round${comma(progress)}.` : `Not yet: ${Math.ceil(MOCK_READY * questions.length)} right counts as ready.`}
            {left <= 0 ? ' The clock ran out.' : ''}
          </p>
        </div>
        <ol className="space-y-3">
          {questions.map((qq, i) => (
            <ReviewRow key={i} n={i + 1} q={qq} a={answers[i]} />
          ))}
        </ol>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setSeed((s) => (s * 48271) % 2_147_483_647);
              setPhase('intro');
            }}
          >
            New round
          </Button>
          <Button onClick={onBack}>Done</Button>
        </div>
      </div>
    );
  }

  const low = left < 60_000;
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="mx-auto flex w-full max-w-xl lg:max-w-2xl items-center gap-3 px-4 pb-2 pt-4">
        <button type="button" onClick={() => setConfirmQuit(true)} className="rounded-xl p-2 text-ink-3 transition hover:bg-sunken hover:text-ink-2" aria-label="Leave mock round">
          <Cross className="h-6 w-6" />
        </button>
        <Bar value={index} max={questions.length} className="h-3" tone="violet" label="Mock progress" />
        <span className={`num w-16 shrink-0 text-right text-sm font-extrabold ${low ? 'text-bad-ink' : 'text-ink-2'}`} aria-label={`Time left ${clock(left)}`}>
          {clock(left)}
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-xl lg:max-w-2xl flex-1 flex-col px-4 pb-6 pt-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Pill tone="violet" icon={<Briefcase className="h-3.5 w-3.5" />}>
            {round}
          </Pill>
          <span className="num text-xs font-bold text-ink-3">
            {index + 1} of {questions.length}
          </span>
        </div>

        <p key={index} className="animate-pop text-xl font-extrabold leading-snug tracking-tight text-ink">
          {q.prompt}
        </p>
        {q.kind === 'choice' && q.code && (
          <pre className="mt-4 overflow-x-auto rounded-2xl bg-sunken p-4 font-mono text-[13px] leading-relaxed text-ink">
            <code>{q.code}</code>
          </pre>
        )}

        {q.kind === 'typed' ? (
          <form
            className="mt-5"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label className="sr-only" htmlFor="mock-answer">
              Your answer
            </label>
            <input
              id="mock-answer"
              key={index}
              autoFocus
              inputMode="decimal"
              autoComplete="off"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setHint(null);
              }}
              placeholder={ANSWER_HINT[q.drill.kind]}
              className="num w-full rounded-2xl border-2 border-line bg-surface px-4 py-3 font-mono text-2xl font-semibold text-ink outline-none placeholder:font-sans placeholder:text-base placeholder:text-ink-3 focus:border-violet"
            />
            {hint && (
              <p className="mt-2 text-sm font-bold text-bad-ink" role="alert">
                {hint}
              </p>
            )}
          </form>
        ) : (
          <div className="mt-5 space-y-2" role="radiogroup" aria-label="Options">
            {q.options.map((o, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={picked === i}
                data-key="choice"
                onClick={() => setPicked(i)}
                className={`w-full rounded-2xl border-2 px-4 py-3 text-left font-semibold transition ${q.code && /print/.test(q.prompt) ? 'font-mono text-[15px]' : ''} ${picked === i ? 'border-violet bg-violet-soft text-ink' : 'border-line bg-surface text-ink hover:border-violet/50'}`}
              >
                {o}
              </button>
            ))}
          </div>
        )}

        <div className="mt-auto grid grid-cols-2 gap-3 pt-6">
          <Button variant="secondary" onClick={() => next(null)}>
            Skip
          </Button>
          <Button onClick={submit} disabled={q.kind === 'typed' ? !input.trim() : picked === null}>
            {index + 1 >= questions.length ? 'Finish' : 'Next'}
          </Button>
        </div>
      </main>

      {confirmQuit && (
        <ConfirmDialog
          title="Leave this mock?"
          body="The clock is still running. If you leave now, this round won't count."
          confirmLabel="Leave"
          onConfirm={onBack}
          onCancel={() => setConfirmQuit(false)}
        />
      )}
    </div>
  );
}

function ReviewRow({ n, q, a }: { n: number; q: MockQuestion; a: MockAnswer }) {
  const good = isRight(q, a);
  const yours = a === null ? 'Skipped' : q.kind === 'typed' ? String(a) : q.options[a as number];
  const answer = q.kind === 'typed' ? q.drill.shown : q.options[q.answer];
  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <p className="flex gap-2 font-bold text-ink">
        <span className={`mt-0.5 shrink-0 ${good ? 'text-good' : 'text-bad'}`}>{good ? <Check className="h-5 w-5" /> : <Cross className="h-5 w-5" />}</span>
        <span>
          <span className="num text-ink-3">{n}. </span>
          {q.prompt}
        </span>
      </p>
      {q.kind === 'choice' && q.code && (
        <pre className="mt-2 overflow-x-auto rounded-xl bg-sunken p-3 font-mono text-[12px] leading-relaxed text-ink">
          <code>{q.code}</code>
        </pre>
      )}
      <p className="mt-2 text-sm text-ink-2">
        <span className="font-bold">You:</span> {yours}
      </p>
      {!good && (
        <p className="text-sm text-ink-2">
          <span className="font-bold">Answer:</span> {answer}
        </p>
      )}
      <p className="mt-1 text-sm leading-relaxed text-ink-3">{q.kind === 'typed' ? q.drill.why : q.why}</p>
    </li>
  );
}
