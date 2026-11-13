/**
 * The visual language every mode shares: the term glyph, the KPI strip with the mode switcher,
 * and the term sheet. Path keeps its own screens; these sit around it and inside the new modes.
 */
import { useEffect, type ReactNode } from 'react';
import { termById, unitById } from '../../lib/content';
import { daysBetween } from '../../lib/dates';
import { strength, type ModeId } from '../../lib/modes/knowledge';
import { tickers } from '../../lib/modes/exchange';
import { lineById } from '../../lib/modes/plans';
import { areaOf, STATUS_LABEL, termStatus, type TermStatus } from '../../lib/modes/status';
import { interchangesAt } from '../../lib/modes/transfer';
import { tidyOption } from '../../lib/questions';
import { isCore } from '../../lib/content';
import type { Progress } from '../../lib/types';
import { Cross, Lock } from '../icons';
import { MODE_INFO, ModeBar } from './ModeBar';
import { Bar, TermDetails } from '../ui';

/**
 * The term glyph. Hollow: not met. Filled in the area colour: learning. White core: known.
 * Pulsing ring: due today. Dashed: not open yet.
 */
export function TermDot({ status, colour, size = 14, className = '' }: { status: TermStatus; colour: string; size?: number; className?: string }) {
  const ring = Math.max(2, Math.round(size / 5));
  const base = { width: size, height: size, borderWidth: ring, borderColor: colour } as const;
  const fill =
    status === 'met' || status === 'due'
      ? { background: colour }
      : status === 'known'
        ? { background: `radial-gradient(circle, rgb(var(--surface)) 0 34%, ${colour} 36%)` }
        : { background: 'rgb(var(--surface))' };
  return (
    <span className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      {status === 'due' && <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: colour }} />}
      <span className={`relative block rounded-full ${status === 'locked' ? 'border-dashed opacity-60' : ''}`} style={{ ...base, ...fill }} />
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
  return (
    <div className="mx-auto max-w-xl space-y-5 px-4 pb-32 pt-5 lg:max-w-4xl lg:px-8 lg:pb-12 lg:pt-8">
      <ModeBar progress={progress} today={today} mode={mode} onMode={onMode} />
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
                <span className="rounded px-1.5 py-0.5 font-mono text-white" style={{ background: colour }}>
                  {area?.code}
                </span>
                {area?.name}
              </p>
              <h2 id="sheet-title" className="mt-1 font-display text-[28px] font-semibold leading-tight tracking-tight text-ink">
                {term.term}
              </h2>
              <p className="mt-1 inline-block rounded-lg bg-sky-soft px-2.5 py-1 text-sm font-bold text-sky-ink">{tidyOption(term.short)}</p>
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
              <dd className="mt-1 font-mono font-semibold text-ink">{tickers[termId] ?? '–'}</dd>
            </div>
            <p className="col-span-3 border-t border-line pt-2 text-xs text-ink-3">
              {line && stop >= 0 && (
                <>
                  Station {stop + 1} of {line.stops.length} on the {area?.code} line, in {unit?.name}.{' '}
                </>
              )}
              {dueIn !== null && (dueIn <= 0 ? 'Review due today.' : `Next review in ${dueIn} day${dueIn === 1 ? '' : 's'}.`)}
              {st && ` Answered ${st.correct} right, ${st.wrong} wrong.`}
            </p>
          </dl>

          {actions && <div className="grid gap-2 sm:grid-cols-2">{actions}</div>}

          <TermDetails term={term} showExamples={1} />

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
