import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { categoryOfTerm, isCore, termById, termName } from '../lib/content';
import type { LessonPlan } from '../lib/lesson';
import { promptFor, retryQuestion, tidyOption, type Rng } from '../lib/questions';
import { finishLesson, graduate, introduce, recordPractice, review } from '../lib/scheduler';
import type { Progress, Question, ScoredQuestion, Term } from '../lib/types';
import { Calculator, Check, Cross, Flame, Pairs, Quote, Scale, Sparkle, Target } from './icons';
import { MatchPairs } from './MatchPairs';
import { Bar, Button, ConfirmDialog, Pill, SpeakButton, TermDetails, type Tone } from './ui';

export interface LessonSummary {
  xp: number;
  firstTryCorrect: number;
  firstTryTotal: number;
  bestRun: number;
  newIds: string[];
  missedIds: string[];
  kind: LessonPlan['kind'];
}

interface Props {
  plan: LessonPlan;
  progress: Progress;
  today: string;
  rng: Rng;
  onProgress: (p: Progress) => void;
  onFinish: (summary: LessonSummary) => void;
  onQuit: () => void;
}

type Item = { q: Question; retry: boolean };

const LABELS: Record<Question['kind'], { text: string; tone: Tone; icon: ReactNode }> = {
  intro: { text: 'New term', tone: 'sky', icon: <Sparkle className="h-3.5 w-3.5" /> },
  meaning: { text: 'What does it mean?', tone: 'ink', icon: <Target className="h-3.5 w-3.5" /> },
  term: { text: 'Which term fits?', tone: 'ink', icon: <Target className="h-3.5 w-3.5" /> },
  fill: { text: 'Fill the gap', tone: 'brand', icon: <Quote className="h-3.5 w-3.5" /> },
  calc: { text: 'Work it out', tone: 'violet', icon: <Calculator className="h-3.5 w-3.5" /> },
  tf: { text: 'True or false?', tone: 'amber', icon: <Scale className="h-3.5 w-3.5" /> },
  match: { text: 'Match the pairs', tone: 'sky', icon: <Pairs className="h-3.5 w-3.5" /> },
};

export function Lesson({ plan, progress, today, rng, onProgress, onFinish, onQuit }: Props) {
  const [items, setItems] = useState<Item[]>(() => plan.questions.map((q) => ({ q, retry: false })));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [stats, setStats] = useState({ firstTryCorrect: 0, firstTryTotal: 0, reviewsCorrect: 0, run: 0, bestRun: 0 });
  const [missed, setMissed] = useState<string[]>([]);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const shownAt = useRef(Date.now());
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const voice = progress.settings.voice;

  const item = items[index];
  const q = item?.q;

  useEffect(() => {
    shownAt.current = Date.now();
    if (q?.kind === 'intro') onProgress(introduce(progressRef.current, q.termId, today));
    // Only when the question changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const finish = useCallback(() => {
    let p = progressRef.current;
    for (const id of plan.newIds) p = graduate(p, id, today);
    const perfect = stats.firstTryTotal > 0 && stats.firstTryCorrect === stats.firstTryTotal;
    const xp = 10 + (perfect ? 5 : 0) + stats.reviewsCorrect;
    p = finishLesson(p, today, xp);
    onProgress(p);
    onFinish({
      xp,
      firstTryCorrect: stats.firstTryCorrect,
      firstTryTotal: stats.firstTryTotal,
      bestRun: stats.bestRun,
      newIds: plan.newIds,
      missedIds: missed,
      kind: plan.kind,
    });
  }, [plan, today, stats, missed, onProgress, onFinish]);

  const next = useCallback(() => {
    setPicked(null);
    if (index + 1 >= items.length) finish();
    else setIndex(index + 1);
  }, [index, items.length, finish]);

  const score = useCallback((correct: boolean, retry: boolean, isReview: boolean) => {
    setStats((s) => {
      const run = correct ? s.run + 1 : 0;
      return {
        firstTryCorrect: s.firstTryCorrect + (!retry && correct ? 1 : 0),
        firstTryTotal: s.firstTryTotal + (retry ? 0 : 1),
        reviewsCorrect: s.reviewsCorrect + (!retry && correct && isReview ? 1 : 0),
        run,
        bestRun: Math.max(s.bestRun, run),
      };
    });
  }, []);

  const answer = useCallback(
    (choice: number) => {
      if (!q || q.kind === 'intro' || q.kind === 'match' || picked !== null) return;
      if (choice < 0 || choice >= q.options.length) return;
      const correct = choice === q.answer;
      const ms = Date.now() - shownAt.current;
      setPicked(choice);
      let p = progressRef.current;
      if (q.review && !item.retry) p = review(p, q.termId, correct, ms, today, isCore(q.termId));
      else p = recordPractice(p, q.termId, correct);
      onProgress(p);
      score(correct, item.retry, q.review);
      if (!correct) {
        setMissed((m) => (m.includes(q.termId) ? m : [...m, q.termId]));
        // One retry per question, at the end of the lesson.
        if (!item.retry) setItems((list) => [...list, { q: retryQuestion(q, rng), retry: true }]);
      }
    },
    [q, item, picked, today, rng, onProgress, score],
  );

  const matchDone = useCallback(
    (mistakes: Record<string, number>) => {
      if (!q || q.kind !== 'match') return;
      let p = progressRef.current;
      for (const id of q.termIds) p = recordPractice(p, id, !mistakes[id]);
      onProgress(p);
      const wrongIds = Object.keys(mistakes).filter((id) => mistakes[id] > 0);
      score(wrongIds.length === 0, item.retry, false);
      if (wrongIds.length) setMissed((m) => [...m, ...wrongIds.filter((id) => !m.includes(id))]);
      next();
    },
    [q, item, onProgress, next, score],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!q || confirmQuit) return;
      if (q.kind === 'intro' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        next();
        return;
      }
      if (q.kind === 'match') return;
      if (picked === null) {
        if (['1', '2', '3', '4'].includes(e.key)) answer(Number(e.key) - 1);
        else if (q.kind === 'tf' && (e.key === 't' || e.key === 'f')) answer(e.key === 't' ? 0 : 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [q, picked, answer, next, confirmQuit]);

  if (!q) return null;
  const term = 'termId' in q ? termById.get(q.termId) : undefined;
  const scored = q.kind !== 'intro' && q.kind !== 'match' ? q : null;
  const answered = scored !== null && picked !== null;
  const correct = answered && picked === scored.answer;
  const label = LABELS[q.kind];

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="mx-auto flex w-full max-w-xl items-center gap-3 px-4 pb-2 pt-4">
        <button
          type="button"
          onClick={() => setConfirmQuit(true)}
          className="rounded-xl p-2 text-ink-3 transition hover:bg-sunken hover:text-ink-2"
          aria-label="Leave lesson"
        >
          <Cross className="h-6 w-6" />
        </button>
        <Bar value={index + (answered ? 1 : 0)} max={items.length} className="h-3" label="Lesson progress" />
        <span
          className={`num inline-flex w-12 shrink-0 items-center justify-end gap-0.5 text-sm font-extrabold transition ${stats.run >= 2 ? 'text-amber' : 'text-transparent'}`}
          aria-label={stats.run >= 2 ? `${stats.run} in a row` : undefined}
        >
          <Flame className="h-4 w-4" />
          {stats.run}
        </span>
      </header>

      <main key={index} className="mx-auto flex w-full max-w-xl flex-1 animate-pop flex-col px-4 pb-56 pt-4">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Pill tone={label.tone} icon={label.icon}>
            {label.text}
          </Pill>
          {item.retry && <Pill tone="amber">Second try</Pill>}
        </div>

        {q.kind === 'intro' && term && <Intro term={term} voice={voice} />}

        {q.kind === 'meaning' && term && (
          <>
            <div className="mb-8 flex items-center gap-3">
              <h1 className="text-[32px] font-extrabold leading-tight tracking-tight text-ink">{term.term}</h1>
              <SpeakButton term={term} enabled={voice} />
            </div>
            <Options q={q} labels={q.options} picked={picked} onPick={answer} />
          </>
        )}

        {q.kind === 'term' && term && (
          <>
            <p className="mb-8 text-xl font-semibold leading-relaxed text-ink">{promptFor(term)}</p>
            <Options q={q} labels={q.options.map(termName)} picked={picked} onPick={answer} />
          </>
        )}

        {q.kind === 'fill' && term && (
          <>
            <p className="mb-8 text-xl font-semibold leading-relaxed text-ink">
              {term.fill.split('____').map((part, i) =>
                i === 0 ? (
                  <span key={i}>{part}</span>
                ) : (
                  <span key={i}>
                    <span
                      className={`mx-1 inline-block min-w-[5rem] rounded-lg border-b-[3px] px-2 text-center font-extrabold ${answered ? 'border-brand bg-brand-soft text-brand-ink' : 'border-ink-3 bg-sunken'}`}
                    >
                      {answered ? term.term : ' '}
                    </span>
                    {part}
                  </span>
                ),
              )}
            </p>
            <Options q={q} labels={q.options.map(termName)} picked={picked} onPick={answer} />
          </>
        )}

        {q.kind === 'calc' && term && (
          <>
            <p className="mb-2 text-xs font-bold text-ink-3">
              {categoryOfTerm.get(term.id)?.name} · {term.term}
            </p>
            <p className="mb-8 text-xl font-semibold leading-relaxed text-ink">{q.prompt}</p>
            <Options q={q} labels={q.options} picked={picked} onPick={answer} grid={q.options.every((o) => o.length <= 16)} />
          </>
        )}

        {q.kind === 'tf' && term && (
          <>
            <p className="mb-2 text-xs font-bold text-ink-3">About: {term.term}</p>
            <p className="mb-8 rounded-3xl border border-line bg-surface p-5 text-xl font-semibold leading-relaxed text-ink shadow-card">{q.prompt}</p>
            <Options q={q} labels={q.options} picked={picked} onPick={answer} grid />
          </>
        )}

        {q.kind === 'match' && <MatchPairs termIds={q.termIds} right={q.right} onDone={matchDone} />}
      </main>

      {q.kind === 'intro' && (
        <footer className="pb-safe fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 px-4 pt-4 backdrop-blur">
          <div className="mx-auto max-w-xl">
            <Button onClick={next} className="w-full">
              Got it
            </Button>
          </div>
        </footer>
      )}

      {answered && term && scored && <Feedback q={scored} term={term} correct={correct} retryQueued={!correct && !item.retry} onNext={next} />}

      {confirmQuit && (
        <ConfirmDialog
          title="Leave this lesson?"
          body="Your answers so far are saved. Terms you have started will come back as reviews."
          confirmLabel="Leave"
          onConfirm={onQuit}
          onCancel={() => setConfirmQuit(false)}
        />
      )}
    </div>
  );
}

const PRAISE = ['Correct', 'Nice', 'Spot on', 'Exactly', 'Well done'];

function Feedback({ q, term, correct, retryQueued, onNext }: { q: ScoredQuestion; term: Term; correct: boolean; retryQueued: boolean; onNext: () => void }) {
  const worked = q.kind === 'calc' || q.kind === 'tf';
  const explain = worked ? (q.why ?? term.definition) : term.definition;
  // Stable per question so the word doesn't change between renders.
  const praise = q.kind === 'calc' ? 'Worked it out' : PRAISE[(q.termId.length + q.answer) % PRAISE.length];
  const headline = correct ? praise : worked ? `Answer: ${q.options[q.answer]}` : `Answer: ${term.term}`;
  return (
    <footer
      className={`pb-safe fixed inset-x-0 bottom-0 z-40 animate-sheet rounded-t-3xl px-4 pt-5 shadow-sheet ${correct ? 'bg-brand-soft' : 'bg-bad-soft'}`}
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto max-w-xl space-y-3">
        <div className="flex items-center gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white ${correct ? 'bg-brand' : 'bg-bad'}`}>
            {correct ? <Check className="h-5 w-5" /> : <Cross className="h-5 w-5" />}
          </span>
          <p className={`text-xl font-extrabold ${correct ? 'text-brand-ink' : 'text-bad-ink'}`}>{headline}</p>
        </div>
        <p className="max-h-[30vh] overflow-y-auto leading-relaxed text-ink-2">
          {!worked && correct && <b className="text-ink">{term.term}: </b>}
          {explain}
        </p>
        {!correct && !worked && term.examples[0] && <p className="text-sm italic leading-relaxed text-ink-2">“{term.examples[0]}”</p>}
        {retryQueued && <p className="text-xs font-bold text-bad-ink">You'll get another go at the end.</p>}
        <Button onClick={onNext} variant={correct ? 'primary' : 'danger'} className="w-full">
          Continue
        </Button>
      </div>
    </footer>
  );
}

function Intro({ term, voice }: { term: Term; voice: boolean }) {
  const cat = categoryOfTerm.get(term.id);
  return (
    <div>
      <p className="mb-1 text-xs font-bold text-ink-3">{cat?.name}</p>
      <div className="mb-1 flex items-center gap-3">
        <h1 className="text-[32px] font-extrabold leading-tight tracking-tight text-ink">{term.term}</h1>
        <SpeakButton term={term} enabled={voice} />
      </div>
      {(term.said || term.aliases?.length) && (
        <p className="text-sm text-ink-3">
          {term.said && <>Say it: {term.said}</>}
          {term.said && term.aliases?.length ? ' · ' : ''}
          {term.aliases?.length ? <>Also: {term.aliases.join(', ')}</> : null}
        </p>
      )}
      <p className="mb-5 mt-4 inline-block rounded-xl bg-sky-soft px-3 py-1.5 text-sm font-bold text-sky-ink">{tidyOption(term.short)}</p>
      <TermDetails term={term} />
    </div>
  );
}

function Options({
  q,
  labels,
  picked,
  onPick,
  grid = false,
}: {
  q: ScoredQuestion;
  labels: string[];
  picked: number | null;
  onPick: (i: number) => void;
  grid?: boolean;
}) {
  const done = picked !== null;
  // Numeric answers read better in a monospaced, tabular face.
  const numeric = q.kind === 'calc' && labels.every((l) => /\d/.test(l) && l.length <= 16);
  return (
    <div className={grid ? 'grid grid-cols-2 gap-3' : 'grid gap-3'}>
      {labels.map((opt, i) => {
        let style = 'border-line bg-surface text-ink shadow-press-line hover:bg-sunken/60 active:translate-y-[1px] active:shadow-none';
        let badge = 'border-line text-ink-3';
        if (done && i === q.answer) {
          style = 'border-brand bg-brand-soft text-brand-ink';
          badge = 'border-brand bg-brand text-white';
        } else if (done && i === picked) {
          style = 'animate-shake border-bad bg-bad-soft text-bad-ink';
          badge = 'border-bad bg-bad text-white';
        } else if (done) style = 'border-line bg-surface text-ink-3 opacity-60';
        return (
          <button
            key={i}
            type="button"
            disabled={done}
            onClick={() => onPick(i)}
            className={`flex items-center gap-3 rounded-2xl border-2 px-4 font-bold transition ${grid ? 'min-h-[4rem] justify-center py-4 text-center text-lg' : 'py-3.5 text-left text-[15px] leading-snug'} ${style}`}
          >
            {!grid && <span className={`hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 text-xs font-extrabold sm:flex ${badge}`}>{i + 1}</span>}
            <span className={numeric ? 'num font-mono text-[17px] font-semibold' : ''}>{opt}</span>
          </button>
        );
      })}
    </div>
  );
}
