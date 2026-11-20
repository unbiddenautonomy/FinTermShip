/**
 * Call It: a deck of claims about terms you have met. Call each one true or false, by
 * button, arrow key or a flick of the card. Every call goes to the shared record as weak
 * evidence: a right call is practice, and a wrong one brings the term back for review tomorrow.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { termById } from '../../lib/content';
import { DECK_SIZE, deckTermIds } from '../../lib/modes/claims';
import { dealDeck, markCall } from '../../lib/modes/roundApi';
import { finishModeSession, kpis, modeRecord, recordAnswer, type Kpis, type ModeId } from '../../lib/modes/knowledge';
import { areaOf, termStatus } from '../../lib/modes/status';
import { seededRng } from '../../lib/questions';
import { finishLesson } from '../../lib/scheduler';
import type { Progress } from '../../lib/types';
import { buzz, reducedMotion, useCountUp } from '../../lib/motion';
import { Confetti } from '../Confetti';
import { Check, Cross, Flame } from '../icons';
import { Button } from '../ui';
import { KpiDelta } from './KpiDelta';
import { useModeAccess, useOwnProgress } from './modeAccess';
import { ModeFrame, TermDot, TermSheet } from './shared';

interface Props {
  progress: Progress;
  today: string;
  onProgress: (p: Progress) => void;
  onMode: (m: ModeId) => void;
}

/** A claim as dealt: its text, without whether it is true. The truth and why come when it is called. */
type Dealt = { termId: string; text: string };
type Call = { claim: Dealt & { truth: boolean; why: string }; said: boolean; right: boolean };

/** How far a card must be dragged to count as a call. */
const FLICK = 90;
/** Or how fast it must be moving when let go (px per ms), having moved at least a little. */
const FLING = 0.55;
const NUDGE = 24;
/** How long a called card takes to be thrown off the table before the next is dealt. */
const TOSS_MS = 260;

export function CallIt({ progress, today, onProgress, onMode }: Props) {
  const [seed, setSeed] = useState(() => Date.now() % 2_147_483_647);
  // Each deck is dealt by the server without the answers; each call is marked there.
  const [dealt, setDealt] = useState<{ seed: number; failed: string | null; deck: Dealt[] } | null>(null);
  const deck = dealt?.seed === seed ? dealt.deck : [];
  const [marking, setMarking] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [calls, setCalls] = useState<Call[]>([]);
  const [run, setRun] = useState(0);
  const [bestRun, setBestRun] = useState(0);
  const [done, setDone] = useState(false);
  const [sheet, setSheet] = useState<string | null>(null);
  const [drag, setDrag] = useState(0);
  const [held, setHeld] = useState(false);
  /** The side a call went to, held while the server marks it so the card stays lit that way. */
  const [pending, setPending] = useState<boolean | null>(null);
  /** The called card is being thrown off to this side; the next is dealt once it's gone. */
  const [leaving, setLeaving] = useState<-1 | 1 | null>(null);
  const dragFrom = useRef<number | null>(null);
  /** Recent pointer positions, to tell how fast the card was moving when let go. */
  const trail = useRef<{ x: number; t: number }[]>([]);
  const pastFlick = useRef(false);
  // The numbers are the learner's own, even while every term counts as met here (Open everything).
  const own = useOwnProgress(progress);
  const ownRef = useRef(own);
  ownRef.current = own;
  const startKpis = useRef<Kpis>(kpis(own, today));
  const progressRef = useRef(progress);
  progressRef.current = progress;

  const card = deck[index];
  const answered = calls.length > index;
  const last = answered ? calls[index] : undefined;
  const record = modeRecord(progress, 'callit');
  const { canOpen } = useModeAccess();

  useEffect(() => {
    let live = true;
    const p = progressRef.current;
    const ids = deckTermIds(p, today, seededRng(seed), DECK_SIZE);
    const known = [...new Set(ids.flatMap((id) => termById.get(id)?.confusables ?? []))].filter((id) => p.terms[id]);
    (ids.length ? dealDeck(ids, known) : Promise.resolve([])).then(
      (d) => live && setDealt({ seed, failed: null, deck: d }),
      (e: Error) => live && setDealt({ seed, failed: e.message, deck: [] }),
    );
    return () => {
      live = false;
    };
  }, [seed, today]);

  useEffect(() => {
    setDrag(0);
    setLeaving(null);
  }, [index, seed, dealt]);

  const call = useCallback(
    async (said: boolean) => {
      if (!card || answered || done || marking) return;
      setMarking(true);
      setPending(said);
      setCallError(null);
      // The card springs back to the middle while the call is marked, then flips to show the answer.
      setDrag(0);
      let answer: { truth: boolean; why: string };
      try {
        answer = await markCall(card.termId, card.text);
      } catch (e) {
        setCallError(e instanceof Error ? e.message : 'That call didn’t go through. Try again.');
        setDrag(0);
        return;
      } finally {
        setMarking(false);
        setPending(null);
      }
      const right = said === answer.truth;
      const p = recordAnswer(progressRef.current, { termId: card.termId, correct: right, evidence: 'weak', mode: 'callit' }, today);
      onProgress(p);
      setCalls((c) => [...c, { claim: { ...card, ...answer }, said, right }]);
      const r = right ? run + 1 : 0;
      setRun(r);
      setBestRun((b) => Math.max(b, r));
    },
    [card, answered, done, marking, run, today, onProgress],
  );

  const advance = useCallback(() => {
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
  }, [index, deck.length, calls, bestRun, today, onProgress]);

  /** Throw the called card off the table, toward the side it was called, then deal the next. */
  const next = useCallback(() => {
    if (!answered || leaving) return;
    if (reducedMotion()) {
      advance();
      return;
    }
    setLeaving(calls[index]?.said ? 1 : -1);
    setTimeout(advance, TOSS_MS);
  }, [answered, leaving, advance, calls, index]);

  const again = () => {
    startKpis.current = kpis(ownRef.current, today);
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
        if (e.key === 'ArrowRight' || e.key === 't') void call(true);
        else if (e.key === 'ArrowLeft' || e.key === 'f') void call(false);
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

  if (dealt?.seed !== seed) {
    return frame(<p className="animate-pulse rounded-3xl border border-dashed border-line px-6 py-10 text-center text-ink-3">Dealing your deck…</p>);
  }

  if (!deck.length && dealt.failed) {
    return frame(
      <div className="rounded-3xl border border-dashed border-line px-6 py-10 text-center">
        <p className="font-display text-xl font-semibold text-ink">This deck didn’t load</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-2">{dealt.failed}</p>
        <div className="mt-6 flex justify-center">
          <Button onClick={again}>Try again</Button>
        </div>
      </div>,
    );
  }

  if (!deck.length) {
    return frame(
      <div className="rounded-3xl border border-dashed border-line px-6 py-10 text-center">
        <p className="font-display text-xl font-semibold text-ink">Meet a few terms first</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-2">Call It only asks about terms you have already learned. Finish a lesson in Path, or ride a few stops on Lines, and your first deck is ready.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={() => onMode('path')}>Go to Path</Button>
          {canOpen('lines') && (
            <Button variant="secondary" onClick={() => onMode('lines')}>
              Ride Lines
            </Button>
          )}
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
          <DeckScore right={right} total={deck.length} />
          <p className="mt-2 text-sm text-ink-2">
            Best run this deck: <b className="num">{bestRun}</b>
            {record.bestRun && bestRun >= record.bestRun ? ' · your best yet' : ''}
          </p>
        </div>
        <KpiDelta before={startKpis.current} after={kpis(own, today)} note="Calls are practice: a wrong one brings the term back tomorrow, a right one doesn't count as its review. To clear Due or move a term up, answer it in Path, Lines, the Exchange, Headline Desk or Finnections." />
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
        <div className={`grid gap-3 ${canOpen('exchange') ? 'grid-cols-2' : ''}`}>
          <Button onClick={again}>Another deck</Button>
          {canOpen('exchange') && (
            <Button variant="secondary" onClick={() => onMode('exchange')}>
              See the Exchange
            </Button>
          )}
        </div>
      </div>,
    );
  }

  const term = termById.get(card.termId)!;
  const area = areaOf(card.termId);
  const colour = area?.colour ?? 'rgb(var(--brand))';
  const tilt = answered ? 0 : drag / 16;
  const lean = answered ? null : pending !== null ? (pending ? 'true' : 'false') : Math.abs(drag) > 30 ? (drag > 0 ? 'true' : 'false') : null;
  // How strongly the TRUE / FALSE stamp shows while dragging: faint at first, full by the flick point.
  const leanStrength = pending !== null ? 1 : Math.min(1, Math.max(0, (Math.abs(drag) - 30) / (FLICK - 30)));
  const flip = answered ? (last!.said ? 180 : -180) : 0;
  const edge = lean === 'true' ? 'rgb(var(--good-strong))' : lean === 'false' ? 'rgb(var(--bad-strong))' : 'rgb(var(--ink))';
  const face = 'relative min-w-0 rounded-xl border-2 bg-surface [backface-visibility:hidden] [grid-area:1/1] [-webkit-backface-visibility:hidden]';
  const release = (x: number) => {
    // Speed over the last ~80ms of the drag, so a quick flick counts even if it was short.
    const now = performance.now();
    const recent = trail.current.filter((s) => now - s.t < 80);
    const first = recent[0];
    const v = first && now > first.t ? (x - first.x) / (now - first.t) : 0;
    if (drag > FLICK || (drag > NUDGE && v > FLING)) void call(true);
    else if (drag < -FLICK || (drag < -NUDGE && v < -FLING)) void call(false);
    else setDrag(0);
  };

  return frame(
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between font-mono text-sm">
          <span className="text-ink-2">
            Card <b className="num text-ink">{index + 1}</b> / {deck.length}
          </span>
          <span className={`num inline-flex items-center gap-1 font-semibold ${run >= 2 ? 'text-bad-strong' : 'text-transparent'}`} aria-label={run >= 2 ? `${run} in a row` : undefined}>
            <Flame className="h-4 w-4" />
            {run} in a row
          </span>
        </div>
        {/* One tick per card: ink for a right call, red for a wrong one. */}
        <div className="mt-2 flex gap-1" role="progressbar" aria-label="Deck progress" aria-valuemin={0} aria-valuemax={deck.length} aria-valuenow={calls.length}>
          {deck.map((_, i) => (
            <span key={i} className={`h-1.5 flex-1 origin-left rounded-sm ${i < calls.length ? `animate-grow ${calls[i].right ? 'bg-ink' : 'bg-bad-strong'}` : i === index ? 'bg-ink/30' : 'bg-ink/10'}`} />
          ))}
        </div>
      </div>

      {/* The table: a dotted mat with the rest of the deck stacked under the card in play. */}
      <div className="relative -mx-4 px-6 py-8 sm:mx-0 sm:rounded-2xl" style={{ backgroundImage: 'radial-gradient(rgb(var(--ink) / 0.13) 1px, transparent 1.2px)', backgroundSize: '14px 14px' }}>
        {index + 1 < deck.length && <div className="absolute inset-x-8 bottom-6 top-10 rotate-[2.5deg] rounded-xl border-2 border-ink bg-surface" style={{ boxShadow: `6px 6px 0 ${colour}` }} aria-hidden="true" />}
        {index + 2 < deck.length && <div className="absolute inset-x-7 bottom-7 top-9 -rotate-[2deg] rounded-xl border-2 border-ink bg-surface" aria-hidden="true" />}
        {/* Two layers: the outer one follows the finger and is thrown off when done; the inner one flips over to the answer. */}
        <div
          key={index}
          className={`relative touch-pan-y select-none ${answered ? '' : `animate-deal ${held ? 'cursor-grabbing' : 'cursor-grab'}`}`}
          style={{
            perspective: '1400px',
            transformOrigin: '50% 90%',
            transform: leaving ? `translateX(${leaving * 135}%) rotate(${leaving * 14}deg)` : `translateX(${answered ? 0 : drag}px) rotate(${tilt}deg)`,
            opacity: leaving ? 0 : 1,
            transition: held
              ? 'none'
              : leaving
                ? `transform ${TOSS_MS}ms cubic-bezier(0.5, 0, 0.75, 0), opacity ${TOSS_MS}ms ease-in`
                : 'transform 480ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
          onPointerDown={(e) => {
            if (answered || marking) return;
            dragFrom.current = e.clientX;
            trail.current = [{ x: e.clientX, t: performance.now() }];
            pastFlick.current = false;
            setHeld(true);
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (dragFrom.current === null) return;
            const d = e.clientX - dragFrom.current;
            trail.current = [...trail.current.slice(-6), { x: e.clientX, t: performance.now() }];
            // A small tick on the phone as the card passes the point where letting go makes the call.
            const past = Math.abs(d) > FLICK;
            if (past !== pastFlick.current) {
              pastFlick.current = past;
              if (past) buzz();
            }
            setDrag(d);
          }}
          onPointerUp={(e) => {
            if (dragFrom.current === null) return;
            dragFrom.current = null;
            setHeld(false);
            release(e.clientX);
          }}
          onPointerCancel={() => {
            dragFrom.current = null;
            setHeld(false);
            setDrag(0);
          }}
        >
          <div
            className="grid grid-cols-1 [transform-style:preserve-3d]"
            style={{ transform: `rotateY(${flip}deg)`, transition: 'transform 640ms cubic-bezier(0.3, 1.25, 0.5, 1)' }}
          >
            {/* The front: the claim. */}
            <div className={face} style={{ borderColor: edge, boxShadow: `8px 8px 0 ${colour}`, transition: 'border-color 150ms' }} aria-hidden={answered}>
              <div className="flex min-h-[19rem] flex-col gap-4 p-6">
                <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.14em] text-ink-3">
                  <TermDot status={termStatus(progress, card.termId, today)} colour={colour} size={11} />
                  <span className="font-semibold" style={{ color: colour }}>
                    {area?.code}
                  </span>
                  <span className="truncate">{area?.name}</span>
                </p>
                <p className="my-auto text-[26px] font-extrabold leading-[1.15] tracking-tight text-ink">
                  <Marked text={card.text} term={term.term} colour={colour} />
                </p>
                <p className="flex justify-between font-mono text-xs text-ink-3" aria-hidden="true">
                  <span>← false</span>
                  <span>flick</span>
                  <span>true →</span>
                </p>
              </div>
              {/* On the edge trailing the drag, so it stays on screen as the card goes over the side. */}
              {lean && (
                <span
                  className={`absolute top-12 rounded-lg border-2 bg-surface/90 px-2 py-0.5 text-sm font-extrabold uppercase tracking-wider ${lean === 'true' ? 'left-5 border-good text-good-ink' : 'right-5 border-bad text-bad-ink'}`}
                  style={{ opacity: 0.35 + 0.65 * leanStrength, transform: `scale(${0.85 + 0.15 * leanStrength}) rotate(${lean === 'true' ? -6 : 6}deg)` }}
                >
                  {lean}
                </span>
              )}
            </div>
            {/* The back: the verdict, turned the right way round once the card has flipped. */}
            <div className={face} style={{ borderColor: 'rgb(var(--ink))', boxShadow: `8px 8px 0 ${colour}`, transform: 'rotateY(180deg)' }} aria-hidden={!answered}>
              {answered && (
                <div className="flex min-h-[19rem] flex-col gap-3 p-6">
                  <p className="flex items-center gap-2 pr-20 font-mono text-xs uppercase tracking-[0.14em] text-ink-3">
                    <TermDot status={termStatus(progress, card.termId, today)} colour={colour} size={11} />
                    <span className="font-semibold" style={{ color: colour }}>
                      {area?.code}
                    </span>
                    <span className="truncate">{area?.name}</span>
                  </p>
                  <p className={`flex items-center gap-2 pr-16 text-xl font-extrabold ${last!.right ? 'text-good-ink' : 'text-bad-ink'}`}>
                    <span className={`flex h-8 w-8 shrink-0 animate-pop-in items-center justify-center rounded-full text-white [animation-delay:260ms] ${last!.right ? 'bg-good' : 'bg-bad'}`}>
                      {last!.right ? <Check className="h-4 w-4" /> : <Cross className="h-4 w-4" />}
                    </span>
                    {last!.right ? 'Right call' : 'Wrong call'}: it's {last!.claim.truth ? 'true' : 'false'}
                  </p>
                  <p className="text-sm italic text-ink-3">“{card.text}”</p>
                  <p className="leading-relaxed text-ink-2">{last!.claim.why}</p>
                  <button type="button" onClick={() => setSheet(card.termId)} className="mt-auto self-start text-sm font-extrabold text-sky-ink">
                    Open {term.term}
                  </button>
                  {/* The truth, stamped on the card as it lands. */}
                  <span
                    className={`absolute right-5 top-5 animate-stamp rounded-lg border-[3px] px-2 py-0.5 font-mono text-sm font-extrabold uppercase tracking-wider ${last!.claim.truth ? 'border-good-strong text-good-ink' : 'border-bad-strong text-bad-ink'}`}
                    aria-hidden="true"
                  >
                    {last!.claim.truth ? 'True' : 'False'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {callError && !answered && (
        <p className="text-center text-sm font-bold text-bad-ink" role="alert">
          {callError}
        </p>
      )}
      {!answered ? (
        <div className={`grid grid-cols-2 gap-4 ${marking ? 'pointer-events-none opacity-60' : ''}`} aria-busy={marking}>
          <button
            type="button"
            onClick={() => void call(false)}
            className="flex items-center justify-center gap-2 rounded-lg border-2 border-ink bg-bad-strong py-4 text-xl font-extrabold uppercase tracking-wide text-white shadow-[5px_5px_0_rgb(var(--ink))] transition active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
          >
            <span aria-hidden="true">←</span> False
          </button>
          <button
            type="button"
            onClick={() => void call(true)}
            className="flex items-center justify-center gap-2 rounded-lg border-2 border-ink bg-good-strong py-4 text-xl font-extrabold uppercase tracking-wide text-white shadow-[5px_5px_0_rgb(var(--ink))] transition active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
          >
            True <span aria-hidden="true">→</span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={next}
          className="w-full rounded-lg border-2 border-ink bg-ink py-4 text-lg font-extrabold uppercase tracking-wide text-bg shadow-[5px_5px_0_rgb(var(--ink)/0.25)] transition active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
        >
          {index + 1 < deck.length ? 'Next card →' : 'Finish deck'}
        </button>
      )}
      <p className="hidden text-center text-xs text-ink-3 sm:block">Drag the card, or press ← for false and → for true.</p>
    </div>,
  );
}

/** The deck's score, counting up as it shows, with confetti for a clean deck. */
function DeckScore({ right, total }: { right: number; total: number }) {
  const shown = useCountUp(right, 600);
  return (
    <p className="num relative mt-2 font-mono text-5xl font-semibold text-ink">
      {right === total && <Confetti />}
      {shown}
      <span className="text-2xl text-ink-3">/{total}</span>
    </p>
  );
}

/** The claim with its term picked out in the area colour, where the term appears in it. */
function Marked({ text, term, colour }: { text: string; term: string; colour: string }) {
  const at = text.toLowerCase().indexOf(term.toLowerCase());
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span style={{ color: colour, textShadow: '2px 2px 0 rgb(var(--ink) / 0.12)' }}>{text.slice(at, at + term.length)}</span>
      {text.slice(at + term.length)}
    </>
  );
}
