/**
 * Headline Desk: a headline breaks, and the learner calls which way each thing on the desk
 * moves. Three headlines a round, at the mode's level, dealt by the server without the answers.
 * Filing a headline sends the calls to be marked; the right calls and why come back, and each
 * line's term goes to the shared record (src/lib/modes/rounds.ts).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { termById } from '../../lib/content';
import { kpis, type Kpis, type ModeId } from '../../lib/modes/knowledge';
import { markHeadline } from '../../lib/modes/roundApi';
import { access, levelNote, finishRound, levelState, recordHeadline, type Headline } from '../../lib/modes/rounds';
import { finishLesson } from '../../lib/scheduler';
import type { Progress } from '../../lib/types';
import { Button } from '../ui';
import { KpiDelta } from './KpiDelta';
import { useModeAccess } from './modeAccess';
import { LevelMeter, NotYet } from './roundKit';
import { useDealtRound } from './useRoundContent';
import { ModeFrame, TermSheet } from './shared';

interface Props {
  progress: Progress;
  today: string;
  onProgress: (p: Progress) => void;
  onMode: (m: ModeId) => void;
}

type Move = 'up' | 'down';
interface Filed {
  headline: Headline;
  picks: Move[];
  right: number;
}

const PAPER = '#ecebe5';
const INK = '#161616';
const RULE = '#c9c7bd';
const RED = '#b3261e';
const GREEN = '#1d6b45';

export function HeadlineDesk({ progress, today, onProgress, onMode }: Props) {
  const open = access(progress, 'headline').open;
  const [seed, setSeed] = useState(() => Date.now() % 2_147_483_647);
  const content = useDealtRound('headline', progress, today, seed, open);
  const round = content.items;
  // Calls on their way to be marked, and why marking failed.
  const [filing, setFiling] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<(Move | undefined)[]>([]);
  const [filed, setFiled] = useState<Filed[]>([]);
  const [done, setDone] = useState<{ before: number; after: number; good: number; score: number } | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const shownAt = useRef(Date.now());
  const startKpis = useRef<Kpis>(kpis(progress, today));
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const { canOpen } = useModeAccess();

  const h = round[index];
  const current = filed.length > index ? filed[index] : undefined;
  const ready = !!h && h.items.every((_, i) => picks[i]);

  useEffect(() => {
    shownAt.current = Date.now();
    setPicks([]);
    setFileError(null);
  }, [index, seed]);

  const file = useCallback(async () => {
    if (!h || current || !ready || filing) return;
    const ps = picks as Move[];
    const ms = Date.now() - shownAt.current;
    setFiling(true);
    setFileError(null);
    try {
      const full = await markHeadline(h.id, ps);
      onProgress(recordHeadline(progressRef.current, full, ps, ms, today));
      setFiled((f) => [...f, { headline: full, picks: ps, right: full.items.filter((it, i) => ps[i] === it.move).length }]);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'That call didn’t go through. Try again.');
    } finally {
      setFiling(false);
    }
  }, [h, current, ready, filing, picks, today, onProgress]);

  const next = useCallback(() => {
    if (!current) return;
    if (index + 1 < round.length) {
      setIndex(index + 1);
      return;
    }
    const right = filed.reduce((n, f) => n + f.right, 0);
    const total = filed.reduce((n, f) => n + f.headline.items.length, 0);
    const score = total ? right / total : 0;
    const before = levelState(progressRef.current, 'headline').level;
    let p = finishLesson(progressRef.current, today, 10 + (score === 1 ? 5 : 0));
    p = finishRound(p, 'headline', today, filed.map((f) => f.headline.id), score);
    onProgress(p);
    const after = levelState(p, 'headline');
    setDone({ before, after: after.level, good: after.good, score });
  }, [current, index, round.length, filed, today, onProgress]);

  const again = () => {
    startKpis.current = kpis(progressRef.current, today);
    setSeed((s) => s + 1);
    setIndex(0);
    setFiled([]);
    setDone(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheet || done || e.key !== 'Enter') return;
      if ((e.target as HTMLElement)?.tagName === 'BUTTON') return;
      if (current) next();
      else void file();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, file, next, sheet, done]);

  const frame = (body: React.ReactNode) => (
    <ModeFrame progress={progress} today={today} mode="headline" onMode={onMode} title="Headline Desk" aside={open ? <LevelMeter progress={progress} mode="headline" /> : undefined}>
      {body}
      {sheet && <TermSheet termId={sheet} progress={progress} today={today} onClose={() => setSheet(null)} onOpenTerm={setSheet} />}
    </ModeFrame>
  );

  if (!open) return frame(<NotYet progress={progress} mode="headline" onMode={onMode} />);
  if (content.state === 'loading') return frame(<p className="py-16 text-center text-sm font-bold text-ink-3">Getting today’s paper…</p>);
  if (content.state !== 'ready' || !round.length) return frame(<NotYet progress={progress} mode="headline" error={content.state !== 'ready' ? content.state : 'No headlines came through. Try again in a moment.'} onMode={onMode} onRetry={content.retry} />);
  // Once filed, the headline on the page is the marked one: each line's move and term, and why.
  const marked = current?.headline;

  if (done) {
    const right = filed.reduce((n, f) => n + f.right, 0);
    const total = filed.reduce((n, f) => n + f.headline.items.length, 0);
    return frame(
      <div className="space-y-5">
        <div className="p-6 text-center" style={{ background: PAPER, color: INK }}>
          <p className="border-b-[3px] border-double pb-2 font-display text-sm font-semibold uppercase tracking-[0.08em]" style={{ borderColor: INK }}>
            Round filed
          </p>
          <p className="num mt-3 font-mono text-5xl font-semibold">
            {right}
            <span className="text-2xl opacity-60">/{total}</span>
          </p>
          <p className="mt-1 text-sm opacity-80">lines called right</p>
          <p className="mt-3 text-sm font-bold">{levelNote(done.before, done.after, done.good)}</p>
        </div>
        <KpiDelta
          before={startKpis.current}
          after={kpis(progress, today)}
          note="A headline called fully right counts like picking a meaning: it can clear a due review. A line called wrong brings its term back tomorrow."
        />
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-extrabold uppercase tracking-[0.12em] text-ink-3">The round</h2>
          {filed.map((f) => (
            <details key={f.headline.id} className="rounded-2xl border border-line bg-surface px-4 py-3">
              <summary className="cursor-pointer text-sm font-bold text-ink">
                <span className={`num mr-2 font-mono ${f.right === f.headline.items.length ? 'text-good-ink' : 'text-bad-ink'}`}>
                  {f.right}/{f.headline.items.length}
                </span>
                {f.headline.head}
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{f.headline.why}</p>
            </details>
          ))}
        </section>
        <div className={`grid gap-3 ${canOpen('finnections') && access(progress, 'finnections').open ? 'grid-cols-2' : ''}`}>
          <Button onClick={again}>Next round</Button>
          {canOpen('finnections') && access(progress, 'finnections').open && (
            <Button variant="secondary" onClick={() => onMode('finnections')}>
              Play Finnections
            </Button>
          )}
        </div>
      </div>,
    );
  }

  const dateline = new Date(`${today}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  return frame(
    <div className="space-y-4">
      <div className="flex gap-1" role="progressbar" aria-label="Round progress" aria-valuemin={0} aria-valuemax={round.length} aria-valuenow={filed.length}>
        {round.map((_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-sm ${i < filed.length ? (filed[i].right === filed[i].headline.items.length ? 'bg-good' : 'bg-bad-strong') : i === index ? 'bg-ink/30' : 'bg-ink/10'}`} />
        ))}
      </div>

      <article key={h.id} className="-mx-4 animate-pop px-5 py-5 sm:mx-0 sm:px-7 sm:py-6" style={{ background: PAPER, color: INK, boxShadow: '0 1px 0 rgb(0 0 0 / 0.08), 0 10px 30px -18px rgb(0 0 0 / 0.5)' }}>
        <header className="flex items-end justify-between gap-3 border-b-[3px] border-double pb-1.5" style={{ borderColor: INK }}>
          <span className="font-display text-[15px] font-semibold uppercase tracking-[0.06em]">The Market Desk</span>
          <span className="font-mono text-[11px] opacity-70">
            {dateline} · {index + 1} of {round.length}
          </span>
        </header>
        <h2 className="mt-4 font-display text-[clamp(1.6rem,5vw,2.4rem)] font-semibold leading-[1.06] tracking-[-0.015em]">{h.head}</h2>
        <p className="mt-2 font-display text-[17px] italic leading-snug" style={{ color: '#3d3d3d' }}>
          {h.dek}
        </p>
        <p className="mb-2 mt-5 text-[11px] font-extrabold uppercase tracking-[0.14em] opacity-60">{current ? 'The calls' : 'Call each one'}</p>
        <ul className="space-y-2">
          {h.items.map((it, i) => {
            const answer = marked?.items[i];
            const mine = current ? current.picks[i] : picks[i];
            const right = answer ? mine === answer.move : null;
            return (
              <li key={it.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border px-3 py-2.5" style={{ background: '#f7f6f2', borderColor: right === null ? RULE : right ? GREEN : RED }}>
                <span className="min-w-0">
                  <span className="block font-bold leading-snug">{it.label}</span>
                  {answer && (
                    <button type="button" onClick={() => setSheet(answer.term)} className="mt-0.5 text-xs font-bold underline decoration-dotted underline-offset-2 opacity-70 hover:opacity-100">
                      {termById.get(answer.term)?.term}
                    </button>
                  )}
                </span>
                <span className="inline-flex gap-1" role="group" aria-label={it.label}>
                  {(['up', 'down'] as const).map((m) => {
                    const chosen = mine === m;
                    const isAnswer = !!answer && answer.move === m;
                    const bg = current ? (isAnswer ? (chosen ? GREEN : 'transparent') : chosen ? RED : 'transparent') : chosen ? INK : 'transparent';
                    const fg = current ? (isAnswer && chosen) || (!isAnswer && chosen) ? '#fff' : isAnswer ? GREEN : INK : chosen ? PAPER : INK;
                    const border = current ? (isAnswer ? GREEN : chosen ? RED : RULE) : INK;
                    return (
                      <button
                        key={m}
                        type="button"
                        disabled={!!current || filing}
                        aria-pressed={chosen}
                        onClick={() => setPicks((p) => Object.assign([...p], { [i]: m }))}
                        className="min-w-[5.2rem] border-[1.5px] px-2.5 py-1.5 text-[13px] font-extrabold transition disabled:cursor-default"
                        style={{ background: bg, color: fg, borderColor: border, borderStyle: current && isAnswer && !chosen ? 'dashed' : 'solid' }}
                      >
                        {m === 'up' ? '▲ Rises' : '▼ Falls'}
                      </button>
                    );
                  })}
                </span>
              </li>
            );
          })}
        </ul>
        {current && (
          <div className="mt-4 animate-pop border-t pt-3" style={{ borderColor: RULE }}>
            <p className="text-sm font-extrabold" style={{ color: current.right === h.items.length ? GREEN : RED }}>
              {current.right === h.items.length ? 'All called right.' : `${current.right} of ${h.items.length} called right.`}
            </p>
            <p className="mt-1 font-display text-[16px] leading-relaxed">{marked?.why}</p>
          </div>
        )}
        {fileError && (
          <p className="mt-4 text-sm font-bold" style={{ color: RED }} role="alert">
            {fileError}
          </p>
        )}
        <div className="mt-5">
          {!current ? (
            <button
              type="button"
              onClick={() => void file()}
              disabled={!ready || filing}
              className="px-5 py-2.5 text-[13px] font-extrabold uppercase tracking-[0.06em] text-white transition disabled:opacity-40"
              style={{ background: RED }}
            >
              {filing ? 'Filing…' : 'File the call'}
            </button>
          ) : (
            <button type="button" onClick={next} className="px-5 py-2.5 text-[13px] font-extrabold uppercase tracking-[0.06em]" style={{ background: INK, color: PAPER }}>
              {index + 1 < round.length ? 'Next headline →' : 'Finish the round'}
            </button>
          )}
        </div>
      </article>
      <p className="text-center text-xs text-ink-3">Made-up news, real mechanics: each call is the textbook first reaction, all else equal.</p>
    </div>,
  );
}
