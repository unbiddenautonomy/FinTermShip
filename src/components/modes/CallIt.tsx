/**
 * Call It: a deck of claims about terms you have met. Call each one true or false, by
 * button, arrow key or a flick of the card. Every call goes to the shared record as weak
 * evidence: it keeps a due term on schedule but never moves it up on its own.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { termById } from '../../lib/content';
import { buildDeck, type Claim } from '../../lib/modes/claims';
import { finishModeSession, kpis, modeRecord, recordAnswer, type Kpis, type ModeId } from '../../lib/modes/knowledge';
import { areaOf, termStatus } from '../../lib/modes/status';
import { seededRng } from '../../lib/questions';
import { finishLesson } from '../../lib/scheduler';
import type { Progress } from '../../lib/types';
import { Check, Cross, Flame } from '../icons';
import { Bar, Button } from '../ui';
import { KpiDelta } from './KpiDelta';
import { ModeFrame, TermDot, TermSheet } from './shared';

interface Props {
  progress: Progress;
  today: string;
  onProgress: (p: Progress) => void;
  onMode: (m: ModeId) => void;
}

type Call = { claim: Claim; said: boolean; right: boolean };

const FLICK = 90;

export function CallIt({ progress, today, onProgress, onMode }: Props) {
  const [seed, setSeed] = useState(() => Date.now() % 2_147_483_647);
  const deck = useMemo(() => buildDeck(progress, today, seededRng(seed)), [seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const [index, setIndex] = useState(0);
  const [calls, setCalls] = useState<Call[]>([]);
  const [run, setRun] = useState(0);
  const [bestRun, setBestRun] = useState(0);
  const [done, setDone] = useState(false);
  const [sheet, setSheet] = useState<string | null>(null);
  const [drag, setDrag] = useState(0);
  const dragFrom = useRef<number | null>(null);
  const shownAt = useRef(Date.now());
  const startKpis = useRef<Kpis>(kpis(progress, today));
  const progressRef = useRef(progress);
  progressRef.current = progress;

  const card = deck[index];
  const answered = calls.length > index;
  const last = answered ? calls[index] : undefined;
  const record = modeRecord(progress, 'callit');

  useEffect(() => {
    shownAt.current = Date.now();
    setDrag(0);
  }, [index, seed]);

  const call = useCallback(
    (said: boolean) => {
      if (!card || answered || done) return;
      const right = said === card.truth;
      const p = recordAnswer(progressRef.current, { termId: card.termId, correct: right, ms: Date.now() - shownAt.current, evidence: 'weak', mode: 'callit' }, today);
      onProgress(p);
      setCalls((c) => [...c, { claim: card, said, right }]);
      const r = right ? run + 1 : 0;
      setRun(r);
      setBestRun((b) => Math.max(b, r));
      setDrag(said ? 400 : -400);
    },
    [card, answered, done, run, today, onProgress],
  );

  const next = useCallback(() => {
    if (!answered) return;
    if (index + 1 < deck.length) {
      setIndex(index + 1);
      return;
    }
    const right = calls.filter((c) => c.right).length;
    const xp = 10 + (right === deck.length ? 5 : 0);
    let p = finishLesson(progressRef.current, today, xp);
    p = finishModeSession(p, 'callit', today, { bestRun });
    onProgress(p);
    setDone(true);
  }, [answered, index, deck.length, calls, bestRun, today, onProgress]);

  const again = () => {
    startKpis.current = kpis(progressRef.current, today);
    setSeed((s) => s + 1);
    setIndex(0);
    setCalls([]);
    setRun(0);
    setBestRun(0);
    setDone(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet || done) return;
      if (!answered) {
        if (e.key === 'ArrowRight' || e.key === 't') call(true);
        else if (e.key === 'ArrowLeft' || e.key === 'f') call(false);
      } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answered, call, next, sheet, done]);

  const frame = (body: React.ReactNode) => (
    <ModeFrame
      progress={progress}
      today={today}
      mode="callit"
      onMode={onMode}
      title="Call It"
      aside={
        record.bestRun ? (
          <span className="num shrink-0 text-right text-xs font-bold text-ink-3">
            Best run
            <br />
            <span className="font-mono text-base text-ink">{record.bestRun}</span>
          </span>
        ) : undefined
      }
    >
      {body}
      {sheet && <TermSheet termId={sheet} progress={progress} today={today} onClose={() => setSheet(null)} onOpenTerm={setSheet} />}
    </ModeFrame>
  );

  if (!deck.length) {
    return frame(
      <div className="rounded-3xl border border-dashed border-line px-6 py-10 text-center">
        <p className="font-display text-xl font-semibold text-ink">Meet a few terms first</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-2">Call It only asks about terms you have already learned. Finish a lesson in Path, or ride a few stops on Lines, and your first deck is ready.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={() => onMode('path')}>Go to Path</Button>
          <Button variant="secondary" onClick={() => onMode('lines')}>
            Ride Lines
          </Button>
        </div>
      </div>,
    );
  }

  if (done) {
    const right = calls.filter((c) => c.right).length;
    const missed = calls.filter((c) => !c.right);
    return frame(
      <div className="space-y-5">
        <div className="rounded-3xl border border-line bg-surface p-6 text-center shadow-card">
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-ink-3">Deck done</p>
          <p className="num mt-2 font-mono text-5xl font-semibold text-ink">
            {right}
            <span className="text-2xl text-ink-3">/{deck.length}</span>
          </p>
          <p className="mt-2 text-sm text-ink-2">
            Best run this deck: <b className="num">{bestRun}</b>
            {record.bestRun && bestRun >= record.bestRun ? ' · your best yet' : ''}
          </p>
        </div>
        <KpiDelta before={startKpis.current} after={kpis(progress, today)} note="Calls hold due terms on schedule. To move a term up, answer it in Path, Lines or the Exchange." />
        {missed.length > 0 && (
          <section>
            <h2 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-[0.12em] text-violet-ink">Worth another look</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {missed.map((c, i) => (
                <li key={i}>
                  <button type="button" onClick={() => setSheet(c.claim.termId)} className="w-full px-4 py-3 text-left hover:bg-sunken">
                    <p className="text-sm font-bold text-ink">{termById.get(c.claim.termId)?.term}</p>
                    <p className="text-sm text-ink-2">
                      “{c.claim.text}” is <b>{c.claim.truth ? 'true' : 'false'}</b>.
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={again}>Another deck</Button>
          <Button variant="secondary" onClick={() => onMode('exchange')}>
            See the Exchange
          </Button>
        </div>
      </div>,
    );
  }

  const term = termById.get(card.termId)!;
  const area = areaOf(card.termId);
  const colour = area?.colour ?? 'rgb(var(--brand))';
  const tilt = answered ? 0 : drag / 14;
  const lean = !answered && Math.abs(drag) > 30 ? (drag > 0 ? 'true' : 'false') : null;

  return frame(
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Bar value={index + (answered ? 1 : 0)} max={deck.length} className="h-2" label="Deck progress" />
        <span className="num shrink-0 font-mono text-sm text-ink-3">
          {index + 1}/{deck.length}
        </span>
        <span className={`num inline-flex w-10 shrink-0 items-center justify-end gap-0.5 text-sm font-extrabold ${run >= 2 ? 'text-amber' : 'text-transparent'}`} aria-label={run >= 2 ? `${run} in a row` : undefined}>
          <Flame className="h-4 w-4" />
          {run}
        </span>
      </div>

      <div className="relative" style={{ perspective: 1200 }}>
        <div
          key={index}
          className={`relative min-h-[19rem] touch-pan-y select-none rounded-3xl border-2 bg-surface shadow-card ${answered ? '' : 'animate-pop cursor-grab active:cursor-grabbing'}`}
          style={{
            borderColor: lean === 'true' ? 'rgb(var(--good))' : lean === 'false' ? 'rgb(var(--bad))' : 'rgb(var(--line))',
            transform: answered ? 'rotateY(0deg)' : `translateX(${drag}px) rotate(${tilt}deg)`,
            transition: dragFrom.current === null ? 'transform 220ms cubic-bezier(0.2,0.8,0.2,1), border-color 150ms' : 'none',
          }}
          onPointerDown={(e) => {
            if (answered) return;
            dragFrom.current = e.clientX;
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (dragFrom.current === null) return;
            setDrag(e.clientX - dragFrom.current);
          }}
          onPointerUp={() => {
            if (dragFrom.current === null) return;
            dragFrom.current = null;
            if (drag > FLICK) call(true);
            else if (drag < -FLICK) call(false);
            else setDrag(0);
          }}
          onPointerCancel={() => {
            dragFrom.current = null;
            setDrag(0);
          }}
        >
          <div className="h-1.5 rounded-t-[22px]" style={{ background: colour }} />
          <div className="flex flex-col gap-4 p-6">
            <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-ink-3">
              <TermDot status={termStatus(progress, card.termId, today)} colour={colour} size={11} />
              <span className="font-mono">{area?.code}</span>
              <span className="truncate normal-case tracking-normal">{term.term}</span>
            </p>
            {!answered ? (
              <p className="font-display text-[22px] font-medium leading-snug text-ink">{card.text}</p>
            ) : (
              <div className="animate-pop space-y-3">
                <p className={`flex items-center gap-2 text-xl font-extrabold ${last!.right ? 'text-good-ink' : 'text-bad-ink'}`}>
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full text-white ${last!.right ? 'bg-good' : 'bg-bad'}`}>
                    {last!.right ? <Check className="h-4 w-4" /> : <Cross className="h-4 w-4" />}
                  </span>
                  {last!.right ? 'Right call' : 'Wrong call'}: it's {card.truth ? 'true' : 'false'}
                </p>
                <p className="text-sm italic text-ink-3">“{card.text}”</p>
                <p className="leading-relaxed text-ink-2">{card.why}</p>
                <button type="button" onClick={() => setSheet(card.termId)} className="text-sm font-extrabold text-sky-ink">
                  Open {term.term}
                </button>
              </div>
            )}
          </div>
          {lean && (
            <span
              className={`absolute top-5 rounded-lg border-2 px-2 py-0.5 text-sm font-extrabold uppercase tracking-wider ${lean === 'true' ? 'right-5 border-good text-good-ink' : 'left-5 border-bad text-bad-ink'}`}
            >
              {lean}
            </span>
          )}
        </div>
      </div>

      {!answered ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => call(false)}
            className="flex items-center justify-center gap-2 rounded-2xl border-2 border-bad/50 bg-bad-soft py-4 text-lg font-extrabold text-bad-ink shadow-press-line active:translate-y-[1px] active:shadow-none"
          >
            <Cross className="h-5 w-5" /> False
          </button>
          <button
            type="button"
            onClick={() => call(true)}
            className="flex items-center justify-center gap-2 rounded-2xl border-2 border-good/50 bg-good-soft py-4 text-lg font-extrabold text-good-ink shadow-press-line active:translate-y-[1px] active:shadow-none"
          >
            True <Check className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <Button onClick={next} className="w-full">
          {index + 1 < deck.length ? 'Next card' : 'Finish deck'}
        </Button>
      )}
      <p className="hidden text-center text-xs text-ink-3 sm:block">Drag the card, or press ← for false and → for true.</p>
    </div>,
  );
}
