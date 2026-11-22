/**
 * The visual language every mode shares: the term glyph, the KPI strip with the mode switcher,
 * and the term sheet. Path keeps its own screens; these sit around it and inside the new modes.
 */
import { useEffect, type ReactNode } from 'react';
import { hasCard, termById, unitById } from '../../lib/content';
import { daysBetween } from '../../lib/dates';
import { isDone } from '../../lib/scheduler';
import { strength, type ModeId } from '../../lib/modes/knowledge';
import { tickerOf } from '../../lib/modes/exchange';
import { lineById } from '../../lib/modes/plans';
import { areaOf, STATUS_LABEL, termStatus, type TermStatus } from '../../lib/modes/status';
import { interchangesAt } from '../../lib/modes/transfer';
import { tidyOption } from '../../lib/questions';
import { isCore } from '../../lib/content';
import type { Progress } from '../../lib/types';
import { Cross, Lock } from '../icons';
import { MODE_INFO, ModeBar } from './ModeBar';
import { useOwnProgress } from './modeAccess';
import { Bar, TermDetails } from '../ui';
import { metal, metalRing } from './metal';

/**
 * The term glyph. Hollow: not met. Filled in the area colour: learning. White core: known.
 * Pulsing ring: due today. Dashed: not open yet.
 */
export function TermDot({ status, colour, size = 14, className = '', metallic = false }: { status: TermStatus; colour: string; size?: number; className?: string; metallic?: boolean }) {
  const ring = Math.max(2, Math.round(size / 5));
  const base = { width: size, height: size, borderWidth: ring, borderColor: colour } as const;
  const filled = status === 'due' || status === 'met' || status === 'known';
  // Due keeps the line colour but gains an amber halo, so it reads apart from Learning even when still (the ping is easy to miss).
  const halo = status === 'due' ? `0 0 0 ${ring}px rgb(var(--surface)), 0 0 0 ${ring * 2}px rgb(var(--amber))` : undefined;
  const fill = halo ? { background: colour, boxShadow: halo } : filled ? { background: colour } : { background: 'rgb(var(--surface))' };
  return (
    <span className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      {status === 'due' && <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: colour }} />}
      {metallic && status !== 'locked' ? (
        // A ring of polished metal, filled with a glossy bead once the term is met.
        <span className="relative block rounded-full" style={{ width: size, height: size, padding: ring, background: metalRing(colour), boxShadow: halo }}>
          <span className="block h-full w-full rounded-full" style={{ background: filled ? metal(colour, '160deg') : 'rgb(var(--surface))' }} />
        </span>
      ) : (
        <span className={`relative block rounded-full ${status === 'locked' ? 'border-dashed opacity-60' : ''}`} style={{ ...base, ...fill }} />
      )}
      {/* Known is filled like Learning, with a tick, so it never reads as an empty station. */}
      {status === 'known' && (
        <svg viewBox="0 0 12 12" className="absolute inset-0 h-full w-full" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.4 6.2 5.2 8l3.4-3.8" />
        </svg>
      )}
    </span>
  );
}

/** The key to the glyphs, shown under the strip once and in the term sheet. */
export function DotKey({ colour = 'rgb(var(--brand))' }: { colour?: string }) {
  const items: TermStatus[] = ['unmet', 'met', 'due', 'known'];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-ink-3">
      {items.map((s) => (
        <li key={s} className="inline-flex items-center gap-1.5">
          <TermDot status={s} colour={colour} size={11} />
          {STATUS_LABEL[s]}
        </li>
      ))}
    </ul>
  );
}

/** A screen header for the new modes: title, a one-line blurb and the shared strip. */
export function ModeFrame({
  progress,
  today,
  mode,
  onMode,
  title,
  aside,
  children,
}: {
  progress: Progress;
  today: string;
  mode: ModeId;
  onMode: (m: ModeId) => void;
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const own = useOwnProgress(progress);
  return (
    <div className="mx-auto max-w-xl space-y-5 px-4 pb-32 pt-5 lg:max-w-4xl lg:px-8 lg:pb-12 lg:pt-8">
      <ModeBar progress={own} today={today} mode={mode} onMode={onMode} />
      <header className="flex items-end justify-between gap-3 border-b border-line pb-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          <p className="text-sm text-ink-3">{MODE_INFO[mode].blurb}</p>
        </div>
        {aside}
      </header>
      {children}
    </div>
  );
}

/** The one term sheet, opened from a station, a stock or a card. */
export function TermSheet({
  termId,
  progress,
  today,
  onClose,
  onOpenTerm,
  actions,
}: {
  termId: string;
  progress: Progress;
  today: string;
  onClose: () => void;
  onOpenTerm: (id: string) => void;
  actions?: ReactNode;
}) {
  const term = termById.get(termId);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!term) return null;
  const area = areaOf(termId);
  const colour = area?.colour ?? 'rgb(var(--brand))';
  const st = progress.terms[termId];
  const status = termStatus(progress, termId, today);
  const str = strength(st, today, isCore(termId));
  const line = area ? lineById.get(area.id) : undefined;
  const stop = line ? line.stops.findIndex((s) => 'term' in s && s.term === termId) : -1;
  const unit = unitById.get(term.unit);
  const twins = interchangesAt(termId).filter((id) => termById.has(id));
  const dueIn = st && st.step > 0 ? daysBetween(today, st.due) : null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={onClose}>
      <div className="max-h-[88dvh] w-full max-w-lg animate-sheet overflow-y-auto rounded-t-3xl bg-surface shadow-sheet sm:animate-pop sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="h-1.5 w-full" style={{ background: colour }} />
        <div className="space-y-5 p-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 text-xs font-extrabold uppercase tracking-[0.12em] text-ink-3">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: colour }} aria-hidden="true" />
                {area?.name}
              </p>
              <h2 id="sheet-title" className="mt-1 font-display text-[28px] font-semibold leading-tight tracking-tight text-ink">
                {term.term}
              </h2>
              {hasCard(termId) && <p className="mt-1 inline-block rounded-lg bg-sky-soft px-2.5 py-1 text-sm font-bold text-sky-ink">{tidyOption(term.short)}</p>}
            </div>
            <button type="button" onClick={onClose} className="rounded-xl p-2 text-ink-3 hover:bg-sunken" aria-label="Close">
              <Cross className="h-5 w-5" />
            </button>
          </div>

          <dl className="grid grid-cols-3 gap-2 rounded-2xl border border-line p-3 text-sm">
            <div>
              <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-3">State</dt>
              <dd className="mt-1 flex items-center gap-1.5 font-bold text-ink">
                {status === 'locked' ? <Lock className="h-3.5 w-3.5 text-ink-3" /> : <TermDot status={status} colour={colour} size={11} />}
                {STATUS_LABEL[status]}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-3">Strength</dt>
              <dd className="num mt-1 font-mono font-semibold text-ink">{st ? str : '–'}</dd>
              {st && <Bar value={str} max={100} className="mt-1 h-1.5" tone={status === 'due' ? 'amber' : 'brand'} label="Strength" />}
            </div>
            <div>
              <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-3">Ticker</dt>
              <dd className="mt-1 font-mono font-semibold text-ink">{tickerOf(termId)}</dd>
            </div>
            <p className="col-span-3 border-t border-line pt-2 text-xs text-ink-3">
              {line && stop >= 0 && (
                <>
                  Station {stop + 1} of {line.stops.length} on the {area?.short} line, in {unit?.name}.{' '}
                </>
              )}
              {isDone(st) ? 'An everyday term you know: it won’t come back for review.' : dueIn !== null && (dueIn <= 0 ? 'Review due today.' : `Next review in ${dueIn} day${dueIn === 1 ? '' : 's'}.`)}
              {st && ` Answered ${st.correct} right, ${st.wrong} wrong.`}
            </p>
          </dl>

          {actions && <div className="grid gap-2 sm:grid-cols-2">{actions}</div>}

          <TermDetails term={term} met={!!st} showExamples={1} />

          {twins.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.12em] text-violet-ink">Often mixed up with</p>
              <div className="flex flex-wrap gap-2">
                {twins.map((id) => {
                  const a = areaOf(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onOpenTerm(id)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink-2 hover:bg-sunken"
                    >
                      <TermDot status={termStatus(progress, id, today)} colour={a?.colour ?? colour} size={10} />
                      {termById.get(id)!.term}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
