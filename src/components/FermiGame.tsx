import { useEffect, useRef, useState } from 'react';
import { bigNumber, DIAL, FERMI, fermiHit, offText, type FermiItem } from '../lib/fermi';
import { markPractice } from '../lib/modes/roundApi';
import { finishGame } from '../lib/practice';
import { GameFrame, Verdict, type GameProps } from './GameFrame';
import { PracticeWait, usePractice } from './usePractice';
import { Calculator } from './icons';
import { Bar, Button } from './ui';

/** The dial starts at 1,000 for every question. */
const START = DIAL.indexOf(1000);

/** A question as dealt: what to estimate, without the answer. The answer and how come once a guess is locked. */
type Dealt = Pick<FermiItem, 'id' | 'q' | 'unit'>;

export function FermiGame(props: GameProps) {
  const dealt = usePractice<{ items: Dealt[] }>('fermi', props.seed);
  if (!dealt.round) return <PracticeWait error={dealt.error} onRetry={dealt.retry} onQuit={props.onQuit} />;
  return <FermiRound {...props} dealt={dealt.round.items} />;
}

function FermiRound({ unitId, progress, today, onProgress, onFinish, onQuit, dealt }: GameProps & { dealt: Dealt[] }) {
  // Each question gains its answer, how and source once its guess is marked.
  const [items, setItems] = useState<FermiItem[]>(() => dealt.map((d) => ({ ...d, answer: 0, how: '' })));
  const [marking, setMarking] = useState(false);
  const [index, setIndex] = useState(0);
  const [dial, setDial] = useState(START);
  const [left, setLeft] = useState(FERMI.seconds);
  const [answers, setAnswers] = useState<{ guess: number; hit: boolean; timedOut: boolean }[]>([]);
  const finished = useRef(false);
  const item = items[index];
  const locked = answers.length > index;
  const guess = DIAL[dial];

  const lock = async (timedOut = false) => {
    if (answers.length > index || marking) return;
    setMarking(true);
    try {
      const full = { ...item, ...(await markPractice<Omit<FermiItem, 'id' | 'q'>>({ kind: 'fermi', id: item.id, guess })) };
      setItems((all) => all.map((x, i) => (i === index ? full : x)));
      setAnswers((a) => (a.length > index ? a : [...a, { guess, hit: fermiHit(guess, full.answer), timedOut }]));
    } catch {
      // Not marked: the guess stays open, and the learner can lock it again.
    } finally {
      setMarking(false);
    }
  };

  // A minute a question; when it runs out, the dial's value is the answer.
  const lockRef = useRef(lock);
  lockRef.current = lock;
  useEffect(() => {
    if (locked) return;
    const started = performance.now();
    let fired = false;
    const t = setInterval(() => {
      const remaining = Math.max(0, FERMI.seconds - Math.floor((performance.now() - started) / 1000));
      setLeft(remaining);
      // Out of time locks the dial's value, once.
      if (remaining === 0 && !fired) {
        fired = true;
        void lockRef.current(true);
      }
    }, 250);
    return () => clearInterval(t);
  }, [index, locked]);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    const score = answers.filter((a) => a.hit).length;
    const passed = score >= FERMI.passHits;
    const { progress: p, xp, firstPass } = finishGame(progress, unitId, today, score, passed);
    onProgress(p);
    const meanOff = answers.reduce((s, a, i) => s + Math.abs(Math.log10(a.guess / items[i].answer)), 0) / answers.length;
    onFinish({
      xp,
      firstTryCorrect: score,
      firstTryTotal: FERMI.items,
      bestRun: 0,
      newIds: [],
      missedIds: [],
      kind: 'game',
      round: {
        unitId,
        kind: 'game',
        passed,
        firstPass,
        detail: `${score} of ${FERMI.items} within 3 times the answer.${passed ? '' : ` To pass: ${FERMI.passHits}.`}`,
        stat: { label: 'Orders off', value: meanOff.toFixed(1) },
        score: { label: 'within 3×', short: 'Hits' },
        notes: [
          {
            title: 'Your estimates',
            items: items.map((it, i) => ({
              prompt: it.q,
              shown: `${answers[i]?.hit ? 'Hit' : 'Miss'}: you said ${bigNumber(answers[i]?.guess ?? 0)}, answer ${bigNumber(it.answer)}`,
            })),
          },
          {
            title: 'How to estimate fast',
            items: [{ prompt: 'Break it into pieces you can guess, multiply, and round to one figure at every step.', shown: 'Errors partly cancel: a guess that is 2× high in one piece and 2× low in another lands on the answer.' }],
          },
        ],
      },
    });
  };

  const next = () => {
    if (index + 1 >= items.length) {
      finish();
      return;
    }
    setIndex(index + 1);
    setDial(START);
    setLeft(FERMI.seconds);
  };

  const a = answers[index];
  return (
    <GameFrame
      unitId={unitId}
      done={answers.length}
      total={FERMI.items}
      counter={`${index + 1} of ${FERMI.items}`}
      icon={<Calculator className="h-3.5 w-3.5" />}
      tone="brand"
      started={index > 0 || dial !== START || locked}
      onQuit={onQuit}
      rules={
        <>
          <p>
            Eight questions, a minute each. Turn the dial to your estimate and lock it in. Within <b>3 times</b> the answer either way is a hit; the score is how many powers of ten you are off.
          </p>
          <p>Break each one into pieces you can guess, and multiply. Nobody expects the exact number, only the right size.</p>
        </>
      }
    >
      <p className="text-xl font-extrabold leading-snug text-ink">{item.q}</p>

      {!locked ? (
        <section aria-label="Your estimate" className="mt-5 space-y-4">
          <div>
            <div className="mb-1 flex justify-between text-xs font-bold text-ink-3">
              <span>Time left</span>
              <span className="num">{left}s</span>
            </div>
            <Bar value={left} max={FERMI.seconds} tone={left <= 10 ? 'bad' : 'brand'} label="Time left" />
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4 text-center shadow-card">
            <p className="num text-3xl font-extrabold text-ink">{guess.toLocaleString('en-IN')}</p>
            <p className="mt-1 text-sm font-bold text-ink-3">
              {bigNumber(guess)}
              {item.unit ? ` ${item.unit}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" className="!px-4" onClick={() => setDial((d) => Math.max(0, d - 1))}>
              −
            </Button>
            <input
              type="range"
              className="w-full accent-[rgb(var(--brand))]"
              aria-label="Your estimate"
              aria-valuetext={bigNumber(guess)}
              min={0}
              max={DIAL.length - 1}
              step={1}
              value={dial}
              onChange={(e) => setDial(Number(e.target.value))}
            />
            <Button variant="secondary" className="!px-4" onClick={() => setDial((d) => Math.min(DIAL.length - 1, d + 1))}>
              +
            </Button>
          </div>
          <div className="flex flex-wrap justify-center gap-2" aria-label="Jump to a size">
            {[
              ['Thousand', 1e3],
              ['Lakh', 1e5],
              ['Million', 1e6],
              ['Crore', 1e7],
              ['Billion', 1e9],
              ['Lakh crore', 1e12],
            ].map(([label, v]) => (
              <button key={label} type="button" onClick={() => setDial(DIAL.indexOf(v as number))} className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-extrabold text-ink-2">
                {label}
              </button>
            ))}
          </div>
          <Button className="w-full text-base" onClick={() => void lock()} disabled={marking}>
            Lock it in
          </Button>
        </section>
      ) : (
        <Verdict good={a.hit} title={a.hit ? 'Within 3 times' : a.timedOut ? 'Out of time' : 'Too far off'} next={index + 1 >= items.length ? 'See how you did' : 'Next question'} onNext={next}>
          <p className="num font-extrabold text-ink">
            Answer: {bigNumber(item.answer)}
            {item.unit ? ` ${item.unit}` : ''}
          </p>
          <p className="text-sm font-bold text-ink-2">
            You said {bigNumber(a.guess)}. {offText(a.guess, item.answer)}.
          </p>
          <p className="leading-relaxed text-ink-2">{item.how}</p>
          {item.source && (
            <p className="text-xs text-ink-3">
              Source:{' '}
              <a href={item.source} target="_blank" rel="noreferrer" className="font-bold underline">
                {new URL(item.source).hostname.replace(/^www\./, '')}
              </a>
              {item.asOf ? `, as of ${item.asOf}` : ''}
            </p>
          )}
        </Verdict>
      )}
    </GameFrame>
  );
}
