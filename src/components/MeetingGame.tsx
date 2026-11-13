import { useEffect, useMemo, useRef, useState } from 'react';
import { glossOrUnit, termById } from '../lib/content';
import { clipSpeech, MEETING, MEETING_QUESTIONS, meetingPassed, newMeetingRound, SETTINGS } from '../lib/meeting';
import { finishGame } from '../lib/practice';
import { seededRng } from '../lib/questions';
import { canSpeak, speak } from '../lib/speech';
import { Choices, GameFrame, Verdict, type GameProps } from './GameFrame';
import { ChatIcon, Speaker } from './icons';
import { Bar, Button } from './ui';

/** How fast the lines of a clip appear, like people taking turns. */
const LINE_MS = 1600;

interface Answer {
  picked: number | null;
  right: boolean;
}

export function MeetingGame({ unitId, seed, progress, today, onProgress, onFinish, onQuit }: GameProps) {
  const items = useMemo(() => newMeetingRound(seededRng(seed)), [seed]);
  const [clipIndex, setClipIndex] = useState(0);
  const [qIndex, setQIndex] = useState(0);
  const [shown, setShown] = useState(1);
  const [left, setLeft] = useState(MEETING.seconds);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const finished = useRef(false);

  const item = items[clipIndex];
  const clip = item.clip;
  const question = item.questions[qIndex];
  const flat = clipIndex * MEETING.perClip + qIndex;
  const allShown = shown >= clip.lines.length;
  const locked = answers.length > flat;
  const voice = progress.settings.voice && canSpeak();

  // Lines appear one at a time; a tap shows them all.
  useEffect(() => {
    if (allShown) return;
    const t = setTimeout(() => setShown((n) => n + 1), LINE_MS);
    return () => clearTimeout(t);
  }, [shown, allShown]);

  const answer = (picked: number | null) => {
    setAnswers((a) => (a.length > flat ? a : [...a, { picked, right: picked === question.answer }]));
  };

  // Half a minute a question, once the whole clip is on screen. Running out counts as wrong.
  const answerRef = useRef(answer);
  answerRef.current = answer;
  useEffect(() => {
    if (!allShown || locked) return;
    const started = performance.now();
    const t = setInterval(() => {
      const remaining = Math.max(0, MEETING.seconds - Math.floor((performance.now() - started) / 1000));
      setLeft(remaining);
      if (remaining === 0) answerRef.current(null);
    }, 250);
    return () => clearInterval(t);
  }, [allShown, locked, clipIndex, qIndex]);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    const score = answers.filter((a) => a.right).length;
    const passed = meetingPassed(score);
    const { progress: p, xp, firstPass } = finishGame(progress, unitId, today, score, passed);
    onProgress(p);
    const perClip = items.map((_, i) => answers.slice(i * MEETING.perClip, (i + 1) * MEETING.perClip).filter((a) => a.right).length);
    const termIds = [...new Set(items.flatMap((it) => it.clip.terms))].filter((id) => termById.has(id));
    onFinish({
      xp,
      firstTryCorrect: score,
      firstTryTotal: MEETING_QUESTIONS,
      bestRun: 0,
      newIds: [],
      missedIds: [],
      kind: 'game',
      round: {
        unitId,
        kind: 'game',
        passed,
        firstPass,
        detail: `${score} of ${MEETING_QUESTIONS} right.${passed ? '' : ` To pass: ${MEETING.passRight}.`}`,
        stat: { label: 'Clips all right', value: `${perClip.filter((n) => n === MEETING.perClip).length} of ${items.length}` },
        score: { label: 'right', short: 'Right' },
        notes: [
          {
            title: 'The clips',
            items: items.map((it, i) => ({ prompt: `${SETTINGS[it.clip.setting]}: ${it.clip.title}`, shown: `${perClip[i]} of ${MEETING.perClip} right` })),
          },
          {
            title: 'Phrases you heard',
            items: termIds.map((id) => {
              const t = termById.get(id)!;
              return { prompt: t.term, shown: glossOrUnit(t) };
            }),
          },
        ],
      },
    });
  };

  const next = () => {
    if (qIndex + 1 < item.questions.length) {
      setQIndex(qIndex + 1);
    } else if (clipIndex + 1 < items.length) {
      setClipIndex(clipIndex + 1);
      setQIndex(0);
      setShown(1);
    } else {
      finish();
      return;
    }
    setLeft(MEETING.seconds);
  };

  const a = answers[flat];
  const last = clipIndex + 1 >= items.length && qIndex + 1 >= item.questions.length;
  return (
    <GameFrame
      unitId={unitId}
      done={answers.length}
      total={MEETING_QUESTIONS}
      counter={`Clip ${clipIndex + 1} of ${items.length}`}
      icon={<ChatIcon className="h-3.5 w-3.5" />}
      tone="violet"
      started={answers.length > 0 || clipIndex > 0}
      onQuit={onQuit}
      rules={
        <>
          <p>
            Five short clips from meetings and desk calls: a morning meeting, a research review, a risk call, the F&O desk and more. Read (or listen to) each one, then answer <b>two questions</b> on what the people meant, half a minute each.
          </p>
          <p>
            Pass with {MEETING.passRight} of {MEETING_QUESTIONS} right. The phrases come from the term units, so the notes afterwards tell you which ones to revise.
          </p>
        </>
      }
    >
      <section aria-label="The clip" className="rounded-2xl border border-line bg-surface p-4 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-ink-3">{SETTINGS[clip.setting]}</p>
            <p className="text-lg font-extrabold text-ink">{clip.title}</p>
          </div>
          {voice && (
            <button
              type="button"
              onClick={() => {
                setShown(clip.lines.length);
                speak(clipSpeech(clip));
              }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-soft text-violet-ink transition hover:brightness-95 active:scale-95"
              aria-label="Read the clip aloud"
            >
              <Speaker className="h-5 w-5" />
            </button>
          )}
        </div>
        <ol className="mt-3 space-y-2.5" aria-live="polite">
          {clip.lines.slice(0, shown).map((l, i) => (
            <li key={i} className="animate-pop">
              <p className="text-xs font-extrabold text-violet-ink">{l.who}</p>
              <p className="text-[15px] leading-snug text-ink">{l.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {allShown && (
        <section aria-label="Question" className="mt-4 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-lg font-extrabold leading-snug text-ink">{question.q}</p>
            <span className="num shrink-0 text-xs font-bold text-ink-3">
              {qIndex + 1} of {item.questions.length}
            </span>
          </div>
          {!locked && <Bar value={left} max={MEETING.seconds} tone={left <= 8 ? 'bad' : 'brand'} label="Time left" />}
          <Choices labels={question.options} picked={locked ? (a.picked ?? -1) : null} answer={question.answer} onPick={(i) => answer(i)} />
          {locked && (
            <Verdict good={a.right} title={a.right ? 'Right' : a.picked === null ? 'Out of time' : 'Not quite'} next={last ? 'See how you did' : qIndex + 1 < item.questions.length ? 'Next question' : 'Next clip'} onNext={next}>
              <p className="leading-relaxed text-ink-2">{question.why}</p>
            </Verdict>
          )}
        </section>
      )}

      {!allShown && (
        <Button variant="secondary" className="mt-4 w-full" onClick={() => setShown(clip.lines.length)}>
          Skip to the questions
        </Button>
      )}
    </GameFrame>
  );
}
