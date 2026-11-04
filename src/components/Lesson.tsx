import { useCallback, useEffect, useRef, useState } from 'react';
import { isCore, termById, termName } from '../lib/content';
import type { LessonPlan } from '../lib/lesson';
import { fillQuestion, meaningQuestion, promptFor, termQuestion, type Rng } from '../lib/questions';
import { finishLesson, graduate, introduce, recordPractice, review } from '../lib/scheduler';
import type { Progress, Question, Term } from '../lib/types';
import { Bar, Button, SpeakButton, TermDetails } from './ui';
import { MatchPairs } from './MatchPairs';

export interface LessonSummary {
  xp: number;
  firstTryCorrect: number;
  firstTryTotal: number;
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

function retryOf(q: Question, rng: Rng): Question {
  const t = termById.get('termId' in q ? q.termId : '');
  if (!t) return q;
  if (q.kind === 'meaning') return meaningQuestion(t, rng);
  if (q.kind === 'term') return termQuestion(t, rng);
  return fillQuestion(t, rng);
}

export function Lesson({ plan, progress, today, rng, onProgress, onFinish, onQuit }: Props) {
  const [items, setItems] = useState<Item[]>(() => plan.questions.map((q) => ({ q, retry: false })));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [stats, setStats] = useState({ firstTryCorrect: 0, firstTryTotal: 0, reviewsCorrect: 0 });
  const [missed, setMissed] = useState<string[]>([]);
  const shownAt = useRef(Date.now());
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const voice = progress.settings.voice;

  const item = items[index];
  const q = item?.q;
  const scoredTotal = items.length;

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

  const answer = useCallback(
    (choice: number) => {
      if (!q || q.kind === 'intro' || q.kind === 'match' || picked !== null) return;
      const correct = choice === q.answer;
      const ms = Date.now() - shownAt.current;
      setPicked(choice);
      let p = progressRef.current;
      if (q.review && !item.retry) p = review(p, q.termId, correct, ms, today, isCore(q.termId));
      else p = recordPractice(p, q.termId, correct);
      onProgress(p);
      if (!item.retry) {
        setStats((s) => ({
          firstTryCorrect: s.firstTryCorrect + (correct ? 1 : 0),
          firstTryTotal: s.firstTryTotal + 1,
          reviewsCorrect: s.reviewsCorrect + (correct && q.review ? 1 : 0),
        }));
      }
      if (!correct) {
        setMissed((m) => (m.includes(q.termId) ? m : [...m, q.termId]));
        // One retry per question, at the end of the lesson.
        if (!item.retry) setItems((list) => [...list, { q: retryOf(q, rng), retry: true }]);
      }
    },
    [q, item, picked, today, rng, onProgress],
  );

  const matchDone = useCallback(
    (mistakes: Record<string, number>) => {
      if (!q || q.kind !== 'match') return;
      let p = progressRef.current;
      for (const id of q.termIds) p = recordPractice(p, id, !mistakes[id]);
      onProgress(p);
      const wrongIds = Object.keys(mistakes).filter((id) => mistakes[id] > 0);
      if (!item.retry) {
        setStats((s) => ({ ...s, firstTryCorrect: s.firstTryCorrect + (wrongIds.length ? 0 : 1), firstTryTotal: s.firstTryTotal + 1 }));
      }
      if (wrongIds.length) setMissed((m) => [...m, ...wrongIds.filter((id) => !m.includes(id))]);
      next();
    },
    [q, item, onProgress, next],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!q) return;
      if (q.kind === 'intro' && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        next();
        return;
      }
      if (q.kind === 'match') return;
      if (picked === null && ['1', '2', '3', '4'].includes(e.key)) answer(Number(e.key) - 1);
      else if (picked !== null && e.key === 'Enter') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [q, picked, answer, next]);

  if (!q) return null;
  const term = 'termId' in q ? termById.get(q.termId) : undefined;
  const answered = picked !== null && q.kind !== 'intro' && q.kind !== 'match';
  const correct = answered && picked === q.answer;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="flex items-center gap-3 px-4 pb-2 pt-4">
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Leave this lesson? Answers so far are saved.')) onQuit();
          }}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          aria-label="Leave lesson"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <Bar value={index} max={scoredTotal} />
      </header>

      <main className="flex flex-1 flex-col px-4 pb-40 pt-4">
        {item.retry && <p className="mb-2 text-sm font-bold uppercase tracking-wide text-amber-600">Try this one again</p>}

        {q.kind === 'intro' && term && <Intro term={term} voice={voice} />}

        {q.kind === 'meaning' && term && (
          <>
            <Prompt label="What does this mean?" />
            <div className="mb-6 flex items-center gap-3">
              <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white">{term.term}</h2>
              <SpeakButton term={term} enabled={voice} />
            </div>
            <Options options={q.options} picked={picked} answer={q.answer} onPick={answer} />
          </>
        )}

        {q.kind === 'term' && term && (
          <>
            <Prompt label="Which term matches?" />
            <p className="mb-6 rounded-2xl bg-slate-100 p-4 text-lg leading-snug text-slate-800 dark:bg-slate-800 dark:text-slate-100">{promptFor(term)}</p>
            <Options options={q.options.map(termName)} picked={picked} answer={q.answer} onPick={answer} />
          </>
        )}

        {q.kind === 'fill' && term && (
          <>
            <Prompt label="Fill the gap" />
            <p className="mb-6 text-xl leading-relaxed text-slate-800 dark:text-slate-100">
              {term.fill.split('____').map((part, i) =>
                i === 0 ? (
                  <span key={i}>{part}</span>
                ) : (
                  <span key={i}>
                    <span className={`mx-1 inline-block min-w-[4rem] border-b-2 px-1 text-center font-bold ${answered ? (correct ? 'border-brand-500 text-brand-600' : 'border-rose-500 text-rose-600') : 'border-slate-400'}`}>
                      {answered ? term.term : ' '}
                    </span>
                    {part}
                  </span>
                ),
              )}
            </p>
            <Options options={q.options.map(termName)} picked={picked} answer={q.answer} onPick={answer} />
          </>
        )}

        {q.kind === 'match' && <MatchPairs key={index} termIds={q.termIds} right={q.right} onDone={matchDone} />}
      </main>

      {q.kind === 'intro' && (
        <footer className="fixed inset-x-0 bottom-0 border-t-2 border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="mx-auto max-w-xl">
            <Button onClick={next} className="w-full">
              Got it
            </Button>
          </div>
        </footer>
      )}

      {answered && term && (
        <footer
          className={`fixed inset-x-0 bottom-0 border-t-2 p-4 ${correct ? 'border-brand-100 bg-brand-50 dark:border-brand-700 dark:bg-[#05291a]' : 'border-rose-100 bg-rose-50 dark:border-rose-900 dark:bg-[#2b0a12]'}`}
          role="status"
        >
          <div className="mx-auto max-w-xl space-y-3">
            <p className={`text-xl font-extrabold ${correct ? 'text-brand-700 dark:text-brand-400' : 'text-rose-700 dark:text-rose-300'}`}>
              {correct ? 'Correct' : `Answer: ${term.term}`}
            </p>
            <p className="text-slate-700 dark:text-slate-200">{term.definition}</p>
            {!correct && term.examples[0] && <p className="text-sm italic text-slate-600 dark:text-slate-300">“{term.examples[0]}”</p>}
            <Button onClick={next} className={`w-full ${correct ? '' : '!bg-rose-600 !shadow-[0_4px_0_0_#9f1239]'}`}>
              Continue
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}

function Prompt({ label }: { label: string }) {
  return <p className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>;
}

function Intro({ term, voice }: { term: Term; voice: boolean }) {
  return (
    <div>
      <p className="mb-3 text-sm font-bold uppercase tracking-wide text-sky-600 dark:text-sky-400">New term</p>
      <div className="mb-1 flex items-center gap-3">
        <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white">{term.term}</h2>
        <SpeakButton term={term} enabled={voice} />
      </div>
      {(term.said || term.aliases?.length) && (
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          {term.said && <>Say it: {term.said}</>}
          {term.said && term.aliases?.length ? ' · ' : ''}
          {term.aliases?.length ? <>Also: {term.aliases.join(', ')}</> : null}
        </p>
      )}
      <TermDetails term={term} />
    </div>
  );
}

function Options({ options, picked, answer, onPick }: { options: string[]; picked: number | null; answer: number; onPick: (i: number) => void }) {
  const done = picked !== null;
  return (
    <div className="grid gap-3">
      {options.map((opt, i) => {
        let style =
          'border-slate-200 bg-white text-slate-800 shadow-[0_3px_0_0_#e2e8f0] hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:shadow-[0_3px_0_0_#334155] dark:hover:bg-slate-700';
        if (done && i === answer) style = 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-[#05291a] dark:text-brand-400';
        else if (done && i === picked) style = 'border-rose-400 bg-rose-50 text-rose-700 dark:bg-[#2b0a12] dark:text-rose-300';
        else if (done) style = 'border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500';
        return (
          <button
            key={i}
            type="button"
            disabled={done}
            onClick={() => onPick(i)}
            className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-base font-semibold transition ${style}`}
          >
            <span className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-current text-xs opacity-60 sm:flex">{i + 1}</span>
            <span>{opt}</span>
          </button>
        );
      })}
    </div>
  );
}
