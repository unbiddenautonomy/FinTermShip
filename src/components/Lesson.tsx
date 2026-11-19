import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { categoryOfTerm, termById } from '../lib/content';
import { applyTest, settleFocus } from '../lib/choose';
import type { LessonPlan } from '../lib/lesson';
import { tidyOption } from '../lib/questions';
import { markPair, markPick, type DealtPlan, type DealtQuestion, type Marked, type PickQuestion } from '../lib/session';
import { evidenceOf, finishModeSession, recordAnswer, type ModeId } from '../lib/modes/knowledge';
import { finishLesson, graduate, introduce } from '../lib/scheduler';
import { speak } from '../lib/speech';
import type { Progress, TalkFormat, Term } from '../lib/types';
import { Calculator, ChatIcon, Check, Cross, Flame, Pairs, Quote, Scale, Speaker, Sparkle, Target } from './icons';
import { MatchPairs } from './MatchPairs';
import { Bar, Button, ConfirmDialog, Pill, SpeakButton, TermDetails, type Tone } from './ui';

export interface LessonSummary {
  xp: number;
  firstTryCorrect: number;
  firstTryTotal: number;
  bestRun: number;
  newIds: string[];
  missedIds: string[];
  kind: LessonPlan['kind'] | 'drill' | 'game' | 'case';
  /** A weak-spots round. */
  weak?: boolean;
  /** Set after an area test. */
  test?: { categoryId: string; right: number; total: number; passed: boolean; credited: number };
  /** Set after a timed drill. */
  drill?: { unitId: string; right: number; total: number; ms: number; passed: boolean; firstPass: boolean; bestMs?: number; missed: { prompt: string; shown: string }[] };
  /** Set after a game or desk case. */
  round?: {
    unitId: string;
    kind: 'game' | 'case';
    passed: boolean;
    firstPass: boolean;
    /** One line under the title. */
    detail: string;
    /** The middle stat: P&L for a game, best calls for a case. */
    stat: { label: string; value: string };
    /** What the score counts, long and short ("checks met", "Checks"). Defaults to checks for a game and calls for a case. */
    score?: { label: string; short: string };
    /** Short notes, such as checks missed or decisions to revisit. */
    notes: { title: string; items: { prompt: string; shown: string }[] }[];
  };
}

interface Props {
  plan: DealtPlan;
  progress: Progress;
  today: string;
  onProgress: (p: Progress) => void;
  onFinish: (summary: LessonSummary) => void;
  onQuit: () => void;
  /** Set when a mode other than Path runs the lesson, so its answers and session are tallied for that mode. */
  mode?: Exclude<ModeId, 'path'>;
}

type Item = { q: DealtQuestion; retry: boolean };

const LABELS: Record<DealtQuestion['kind'], { text: string; tone: Tone; icon: ReactNode }> = {
  intro: { text: 'New term', tone: 'sky', icon: <Sparkle className="h-3.5 w-3.5" /> },
  meaning: { text: 'What does it mean?', tone: 'ink', icon: <Target className="h-3.5 w-3.5" /> },
  term: { text: 'Which term fits?', tone: 'ink', icon: <Target className="h-3.5 w-3.5" /> },
  fill: { text: 'Fill the gap', tone: 'brand', icon: <Quote className="h-3.5 w-3.5" /> },
  calc: { text: 'Work it out', tone: 'violet', icon: <Calculator className="h-3.5 w-3.5" /> },
  tf: { text: 'True or false?', tone: 'amber', icon: <Scale className="h-3.5 w-3.5" /> },
  match: { text: 'Match the pairs', tone: 'sky', icon: <Pairs className="h-3.5 w-3.5" /> },
  talk: { text: 'Desk talk', tone: 'violet', icon: <ChatIcon className="h-3.5 w-3.5" /> },
  listen: { text: 'Listen and pick', tone: 'sky', icon: <Speaker className="h-3.5 w-3.5" /> },
};

const TALK_LABELS: Record<TalkFormat, { text: string; tone: Tone; icon: ReactNode }> = {
  decode: { text: 'Decode it', tone: 'violet', icon: <Quote className="h-3.5 w-3.5" /> },
  say: { text: 'Say it like the desk', tone: 'brand', icon: <ChatIcon className="h-3.5 w-3.5" /> },
  reply: { text: 'Respond in the room', tone: 'sky', icon: <ChatIcon className="h-3.5 w-3.5" /> },
  misuse: { text: 'Spot the misuse', tone: 'amber', icon: <Target className="h-3.5 w-3.5" /> },
};

export function Lesson({ plan, progress, today, onProgress, onFinish, onQuit, mode }: Props) {
  const [items, setItems] = useState<Item[]>(() => plan.questions.map((q) => ({ q, retry: false })));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  /** The server's mark of the pick: the right option and the reason. */
  const [marked, setMarked] = useState<Marked | null>(null);
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const [stats, setStats] = useState({ firstTryCorrect: 0, firstTryTotal: 0, reviewsCorrect: 0, run: 0, bestRun: 0 });
  const [missed, setMissed] = useState<string[]>([]);
  const [confirmQuit, setConfirmQuit] = useState(false);
  /** Area tests: terms answered right, scored at the end. */
  const testRight = useRef(new Set<string>());
  const isTest = plan.kind === 'test';
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const voice = progress.settings.voice;

  const item = items[index];
  const q = item?.q;

  useEffect(() => {
    if (q?.kind === 'intro') onProgress(introduce(progressRef.current, q.termId, today));
    // Only when the question changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const finish = useCallback(() => {
    let p = progressRef.current;
    for (const id of plan.newIds) p = graduate(p, id, today);
    let test: LessonSummary['test'];
    if (isTest && plan.categoryId) {
      const right = [...testRight.current];
      const before = p;
      p = applyTest(p, plan.categoryId, right, plan.questions.length, today);
      const credited = Object.keys(p.terms).length - Object.keys(before.terms).length;
      test = { categoryId: plan.categoryId, right: right.length, total: plan.questions.length, passed: !!p.tests?.[plan.categoryId]?.passed, credited };
    }
    p = settleFocus(p);
    const perfect = stats.firstTryTotal > 0 && stats.firstTryCorrect === stats.firstTryTotal;
    const xp = 10 + (perfect ? 5 : 0) + stats.reviewsCorrect;
    p = finishLesson(p, today, xp);
    if (mode) p = finishModeSession(p, mode, today);
    onProgress(p);
    onFinish({
      xp,
      firstTryCorrect: stats.firstTryCorrect,
      firstTryTotal: stats.firstTryTotal,
      bestRun: stats.bestRun,
      newIds: plan.newIds,
      missedIds: missed,
      kind: plan.kind,
      weak: plan.weak,
      test,
    });
  }, [plan, today, stats, missed, isTest, onProgress, onFinish, mode]);

  const next = useCallback(() => {
    setPicked(null);
    setMarked(null);
    setMarkError(null);
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
    async (choice: number) => {
      if (!q || q.kind === 'intro' || q.kind === 'match' || picked !== null || marking) return;
      if (choice < 0 || choice >= q.options.length) return;
      // The server marks the pick: the right answer is not in the page until now.
      setMarking(true);
      setMarkError(null);
      let m: Marked;
      try {
        m = await markPick(q);
      } catch (e) {
        setMarkError(e instanceof Error ? e.message : 'Something went wrong. Try again in a moment.');
        return;
      } finally {
        setMarking(false);
      }
      const correct = choice === m.answer;
      setMarked(m);
      setPicked(choice);
      score(correct, item.retry, q.review);
      if (isTest) {
        // A test only scores; nothing is learned or retried until it ends.
        if (correct) testRight.current.add(q.termId);
        else setMissed((m) => (m.includes(q.termId) ? m : [...m, q.termId]));
        return;
      }
      // Every mode, Path included, records through the same rule: the first answer on a due term
      // is its review. A term being taught here, a retry and a chosen practice round are practice.
      const practice = item.retry || plan.kind === 'practice' || plan.newIds.includes(q.termId);
      onProgress(recordAnswer(progressRef.current, { termId: q.termId, correct, evidence: evidenceOf(q.kind), mode: mode ?? 'path', practice }, today));
      if (!correct) {
        setMissed((m) => (m.includes(q.termId) ? m : [...m, q.termId]));
        // One retry per question, at the end of the lesson.
        const again = q.retry;
        if (!item.retry && again) setItems((list) => [...list, { q: again, retry: true }]);
      }
    },
    [q, item, picked, marking, today, isTest, onProgress, score, mode, plan],
  );

  const matchDone = useCallback(
    (mistakes: Record<string, number>) => {
      if (!q || q.kind !== 'match') return;
      let p = progressRef.current;
      // A match round is practice: once one pair is placed the others narrow down, so it can't stand as a review.
      for (const id of q.termIds) p = recordAnswer(p, { termId: id, correct: !mistakes[id], evidence: 'medium', mode: mode ?? 'path', practice: true }, today);
      onProgress(p);
      const wrongIds = Object.keys(mistakes).filter((id) => mistakes[id] > 0);
      score(wrongIds.length === 0, item.retry, false);
      if (wrongIds.length) setMissed((m) => [...m, ...wrongIds.filter((id) => !m.includes(id))]);
      next();
    },
    [q, item, onProgress, next, score, mode, today],
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
      // A browser or system shortcut (Ctrl+F, Cmd+1) is not an answer.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (picked === null) {
        if (['1', '2', '3', '4'].includes(e.key)) void answer(Number(e.key) - 1);
        else if (q.kind === 'tf' && (e.key === 't' || e.key === 'f')) void answer(q.options.indexOf(e.key === 't' ? 'True' : 'False'));
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
  const answered = scored !== null && picked !== null && marked !== null;
  const correct = answered && picked === marked.answer;
  const label = q.kind === 'talk' ? TALK_LABELS[q.format] : LABELS[q.kind];
  const pick = (i: number) => void answer(i);
  const right = marked?.answer ?? null;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="mx-auto flex w-full max-w-xl lg:max-w-2xl items-center gap-3 px-4 pb-2 pt-4">
        <button
          type="button"
          onClick={() => setConfirmQuit(true)}
          className="rounded-xl p-2 text-ink-3 transition hover:bg-sunken hover:text-ink-2"
          aria-label="Leave lesson"
        >
          <Cross className="h-6 w-6" />
        </button>
        <Bar value={index + (answered ? 1 : 0)} max={items.length} className="h-3" label="Lesson progress" lively />
        <span
          className={`num inline-flex w-12 shrink-0 items-center justify-end gap-0.5 text-sm font-extrabold transition ${stats.run >= 2 ? 'text-amber' : 'text-transparent'}`}
          aria-label={stats.run >= 2 ? `${stats.run} in a row` : undefined}
        >
          {/* Keyed on the run, so the flame flares each time it grows. */}
          <Flame key={stats.run} className={`h-4 w-4 ${stats.run >= 2 ? 'animate-flare' : ''}`} />
          {stats.run}
        </span>
      </header>

      <main key={index} className="mx-auto flex w-full max-w-xl lg:max-w-2xl flex-1 animate-enter flex-col px-4 pb-56 pt-4">
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
              <h1 className="text-[32px] font-display font-semibold leading-tight tracking-tight text-ink">{term.term}</h1>
              <SpeakButton term={term} enabled={voice} />
            </div>
            <Options q={q} labels={q.options} picked={picked} right={right} busy={marking} onPick={pick} />
          </>
        )}

        {q.kind === 'term' && term && (
          <>
            <p className="mb-8 text-xl font-semibold leading-relaxed text-ink">{q.prompt}</p>
            <Options q={q} labels={q.options} picked={picked} right={right} busy={marking} onPick={pick} />
          </>
        )}

        {q.kind === 'fill' && term && (
          <>
            <p className="mb-8 text-xl font-semibold leading-relaxed text-ink">
              {q.text.split('____').map((part, i) =>
                i === 0 ? (
                  <span key={i}>{part}</span>
                ) : (
                  <span key={i}>
                    <span
                      className={`${/^[,.;:!?)]/.test(part) ? 'ml-1' : 'mx-1'} inline-block min-w-[5rem] rounded-lg border-b-[3px] px-2 text-center font-extrabold ${answered ? 'animate-drop border-good bg-good-soft text-good-ink' : 'border-ink-3 bg-sunken'}`}
                    >
                      {answered ? (marked.blank ?? term.term) : ' '}
                    </span>
                    {part}
                  </span>
                ),
              )}
            </p>
            <Options q={q} labels={q.options} picked={picked} right={right} busy={marking} onPick={pick} />
          </>
        )}

        {q.kind === 'calc' && term && (
          <>
            <p className="mb-2 text-xs font-bold text-ink-3">
              {categoryOfTerm.get(term.id)?.name} · {term.term}
            </p>
            <p className="mb-8 text-xl font-semibold leading-relaxed text-ink">{q.prompt}</p>
            <Options q={q} labels={q.options} picked={picked} right={right} busy={marking} onPick={pick} grid={q.options.every((o) => o.length <= 16)} />
          </>
        )}

        {q.kind === 'tf' && term && (
          <>
            <p className="mb-2 text-xs font-bold text-ink-3">About: {term.term}</p>
            <p className="mb-8 rounded-3xl border border-line bg-surface p-5 text-xl font-semibold leading-relaxed text-ink shadow-card">{q.prompt}</p>
            <Options q={q} labels={q.options} picked={picked} right={right} busy={marking} onPick={pick} grid />
          </>
        )}

        {q.kind === 'talk' && term && (
          <>
            <TalkPrompt format={q.format} who={q.who} prompt={q.prompt} term={term} />
            <Options q={q} labels={q.options} picked={picked} right={right} busy={marking} onPick={pick} />
          </>
        )}

        {q.kind === 'listen' && term && (
          <>
            <ListenPrompt term={term} answered={answered} />
            <Options q={q} labels={q.options} picked={picked} right={right} busy={marking} onPick={pick} />
          </>
        )}

        {q.kind === 'match' && <MatchPairs termIds={q.termIds} right={q.right} check={(l, r) => markPair(q.token, l, r)} onDone={matchDone} />}
        {markError && (
          <p role="alert" className="mt-4 text-sm font-bold text-bad-ink">
            {markError}
          </p>
        )}
      </main>

      {q.kind === 'intro' && (
        <footer className="pb-safe fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 px-4 pt-4 backdrop-blur">
          <div className="mx-auto max-w-xl lg:max-w-2xl">
            <Button onClick={next} className="w-full">
              Got it
            </Button>
          </div>
        </footer>
      )}

      {answered && term && scored && <Feedback q={scored} marked={marked} term={term} correct={correct} retryQueued={!correct && !item.retry && !!scored.retry} onNext={next} />}

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

function Feedback({ q, marked, term, correct, retryQueued, onNext }: { q: PickQuestion; marked: Marked; term: Term; correct: boolean; retryQueued: boolean; onNext: () => void }) {
  const talk = q.kind === 'talk';
  const worked = q.kind === 'calc' || q.kind === 'tf';
  const explain = talk ? marked.why : worked ? (marked.why ?? term.definition) : term.definition;
  // Stable per question so the word doesn't change between renders.
  const praise = q.kind === 'calc' ? 'Worked it out' : PRAISE[(q.termId.length + marked.answer) % PRAISE.length];
  const misuse = q.kind === 'talk' && q.format === 'misuse';
  // An example to show after a miss: not the sentence just asked, and not always the first one.
  const examples = (term.examples ?? []).filter((_, i) => q.kind !== 'fill' || i !== q.from);
  const example = examples.length ? examples[(q.termId.length + marked.answer) % examples.length] : undefined;
  const headline = correct ? praise : talk ? (misuse ? 'That one is fine' : 'Not quite') : worked ? `Answer: ${q.options[marked.answer]}` : `Answer: ${term.term}`;
  return (
    <footer
      className={`pb-safe fixed inset-x-0 bottom-0 z-40 animate-sheet rounded-t-3xl px-4 pt-5 shadow-sheet ${correct ? 'bg-good-soft' : 'bg-bad-soft'}`}
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto max-w-xl lg:max-w-2xl space-y-3">
        <div className="flex items-center gap-3">
          <span className={`flex h-9 w-9 shrink-0 animate-pop-in items-center justify-center rounded-full text-white [animation-delay:120ms] ${correct ? 'bg-good' : 'bg-bad'}`}>
            {correct ? <Check className="h-5 w-5" /> : <Cross className="h-5 w-5" />}
          </span>
          <p className={`text-xl font-extrabold ${correct ? 'text-good-ink' : 'text-bad-ink'}`}>{headline}</p>
        </div>
        {talk && !correct && (
          <p className="leading-relaxed text-ink">
            <b>{misuse ? 'The misuse: ' : 'Best answer: '}</b>
            {q.options[marked.answer]}
          </p>
        )}
        <p className="max-h-[30vh] overflow-y-auto leading-relaxed text-ink-2">
          {!worked && !talk && correct && <b className="text-ink">{term.term}: </b>}
          {explain}
        </p>
        {talk && (
          <p className="text-sm text-ink-3">
            Practises: <b className="text-ink-2">{term.term}</b>
          </p>
        )}
        {!correct && !worked && !talk && example && <p className="text-sm italic leading-relaxed text-ink-2">“{example}”</p>}
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
        <h1 className="text-[32px] font-display font-semibold leading-tight tracking-tight text-ink">{term.term}</h1>
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
      <TermDetails term={term} met />
    </div>
  );
}

/** What a talk item shows above its options. */
function TalkPrompt({ format, who, prompt, term }: { format: TalkFormat; who?: string; prompt?: string; term: Term }) {
  if (format === 'misuse') {
    return (
      <p className="mb-8 text-xl font-semibold leading-relaxed text-ink">
        One of these uses <b className="font-extrabold">{term.term}</b> wrongly. Which one?
      </p>
    );
  }
  const lead = format === 'decode' ? 'Heard on the desk' : format === 'say' ? 'In plain words' : `${who ?? 'Someone'} says`;
  const ask = format === 'decode' ? 'What does it mean?' : format === 'say' ? 'How would a trader say it?' : "What's the strongest reply?";
  const quoted = format !== 'say';
  return (
    <>
      <p className="mb-2 text-xs font-bold text-ink-3">{lead}</p>
      <p className="mb-4 rounded-3xl border border-line bg-surface p-5 text-xl font-semibold leading-relaxed text-ink shadow-card">
        {quoted ? `“${prompt}”` : prompt}
      </p>
      <p className="mb-6 font-bold text-ink-2">{ask}</p>
    </>
  );
}

/** Listen and pick: the term is spoken when the question opens; its name shows once answered. */
function ListenPrompt({ term, answered }: { term: Term; answered: boolean }) {
  const [shown, setShown] = useState(false);
  const words = term.speak ?? term.said ?? term.term;
  useEffect(() => {
    speak(words);
  }, [words]);
  return (
    <div className="mb-8 flex items-center gap-4">
      <button
        type="button"
        onClick={() => speak(words)}
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-sky-soft text-sky-ink transition hover:brightness-95 active:scale-95"
        aria-label="Play it again"
      >
        <Speaker className="h-8 w-8" />
      </button>
      <div>
        {answered ? (
          <p className="text-[28px] font-extrabold leading-tight tracking-tight text-ink">{term.term}</p>
        ) : (
          <>
            <p className="text-lg font-semibold text-ink">Listen, then pick what it means.</p>
            {shown ? (
              <p className="text-sm text-ink-3">It sounds like: {term.said}</p>
            ) : (
              <button type="button" onClick={() => setShown(true)} className="text-sm font-bold text-sky-ink underline">
                Can't hear it? Show the words
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Options({
  q,
  labels,
  picked,
  right,
  busy,
  onPick,
  grid = false,
}: {
  q: PickQuestion;
  labels: string[];
  picked: number | null;
  /** The right option, once the server has marked the pick. */
  right: number | null;
  /** A pick is being marked. */
  busy: boolean;
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
        if (done && i === right) {
          // A right pick swells with a soft ring; after a miss the right answer just turns green.
          style = `border-good bg-good-soft text-good-ink ${i === picked ? 'animate-bump-halo' : ''}`;
          badge = 'border-good bg-good text-white';
        } else if (done && i === picked) {
          style = 'animate-shake border-bad bg-bad-soft text-bad-ink';
          badge = 'border-bad bg-bad text-white';
        } else if (done) style = 'border-line bg-surface text-ink-3 opacity-60';
        return (
          <button
            key={i}
            type="button"
            disabled={done || busy}
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
