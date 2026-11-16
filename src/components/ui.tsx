import { useEffect, useState, type ReactNode } from 'react';
import { categoryOfTerm, hasCard, unitById } from '../lib/content';
import { canSpeak, speakTerm } from '../lib/speech';
import type { Term } from '../lib/types';
import { Speaker } from './icons';
import { useTermCards } from './useCards';

export type Tone = 'brand' | 'good' | 'sky' | 'amber' | 'violet' | 'bad' | 'ink';

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className = '',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const styles = {
    primary:
      'bg-brand text-white shadow-press hover:brightness-105 active:translate-y-[2px] active:shadow-none disabled:bg-line disabled:text-ink-3 disabled:shadow-none',
    secondary: 'bg-surface text-ink border border-line shadow-press-line hover:bg-sunken active:translate-y-[1px] active:shadow-none',
    ghost: 'text-ink-2 hover:bg-sunken',
    danger: 'bg-bad-strong text-white shadow-press-bad active:translate-y-[2px] active:shadow-none',
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-[15px] font-extrabold tracking-wide transition disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

const barFill: Record<Tone, string> = {
  brand: 'bg-brand',
  good: 'bg-good',
  sky: 'bg-sky',
  amber: 'bg-amber',
  violet: 'bg-violet',
  bad: 'bg-bad',
  ink: 'bg-ink-3',
};

export function Bar({
  value,
  max,
  className = 'h-2',
  tone = 'brand',
  label,
  lively = false,
}: {
  value: number;
  max: number;
  className?: string;
  tone?: Tone;
  label?: string;
  /** Springs forward a little past each step and settles, with a sheen along the top: for a lesson's progress. */
  lively?: boolean;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className={`w-full overflow-hidden rounded-full bg-sunken ${className}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <div
        className={`relative h-full rounded-full ${barFill[tone]} transition-[width] ${lively ? 'duration-700 ease-spring-soft' : 'duration-500 ease-out'}`}
        style={{ width: `${pct}%` }}
      >
        {lively && pct > 0 && <span className="absolute inset-x-2 top-[3px] h-[3px] rounded-full bg-white/35" aria-hidden="true" />}
      </div>
    </div>
  );
}

const ringStroke: Record<Tone, string> = {
  brand: 'stroke-brand',
  good: 'stroke-good',
  sky: 'stroke-sky',
  amber: 'stroke-amber',
  violet: 'stroke-violet',
  bad: 'stroke-bad',
  ink: 'stroke-ink-3',
};

/** Circular progress, used for the daily goal, path units and results. */
export function Ring({
  value,
  max,
  size = 64,
  stroke = 6,
  tone = 'brand',
  children,
  label,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  tone?: Tone;
  children?: ReactNode;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const target = max > 0 ? Math.min(1, value / max) : 0;
  // Starts empty and sweeps to its value once it is on screen.
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setPct(target));
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-sunken" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className={`${ringStroke[tone]} transition-[stroke-dashoffset] duration-700 ease-out`}
          style={{ opacity: target === 0 ? 0 : 1 }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

const pillTone: Record<Tone, string> = {
  brand: 'bg-brand-soft text-brand-ink',
  good: 'bg-good-soft text-good-ink',
  sky: 'bg-sky-soft text-sky-ink',
  amber: 'bg-amber-soft text-amber-ink',
  violet: 'bg-violet-soft text-violet-ink',
  bad: 'bg-bad-soft text-bad-ink',
  ink: 'bg-sunken text-ink-2',
};

export function Pill({ tone = 'ink', icon, children, className = '' }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider ${pillTone[tone]} ${className}`}>
      {icon}
      {children}
    </span>
  );
}

export function SpeakButton({ term, enabled, size = 'md' }: { term: Term; enabled: boolean; size?: 'sm' | 'md' }) {
  if (!enabled || !canSpeak()) return null;
  const dims = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  return (
    <button
      type="button"
      onClick={() => speakTerm(term)}
      className={`inline-flex ${dims} shrink-0 items-center justify-center rounded-xl bg-sky-soft text-sky-ink transition hover:brightness-95 active:scale-95`}
      aria-label={`Hear "${term.term}"`}
      title="Hear it"
    >
      <Speaker className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />
    </button>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-line bg-surface p-5 shadow-card ${className}`}>{children}</div>;
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
      <h2 className="text-xs font-extrabold uppercase tracking-[0.12em] text-violet-ink">{children}</h2>
      {aside && <span className="text-xs font-semibold text-ink-3">{aside}</span>}
    </div>
  );
}

/** Six dots for the six review steps. */
export function StepDots({ step }: { step: number }) {
  return (
    <span className="inline-flex gap-[3px]" aria-label={`Step ${step} of 6`} role="img">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= step ? (step >= 4 ? 'bg-brand' : 'bg-sky') : 'bg-line'}`} />
      ))}
    </span>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-brand' : 'bg-line'}`}
    >
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

/** A term's card. Pass `met` when the learner has met it, so its card is fetched if it isn't here yet. */
export function TermDetails({ term, met = false, showExamples = 2 }: { term: Term; met?: boolean; showExamples?: number }) {
  useTermCards(met ? [term.id] : []);
  if (!hasCard(term.id)) return met ? <CardLoading /> : <NotReached term={term} />;
  return (
    <div className="space-y-4">
      <p className="text-[17px] leading-relaxed text-ink">{term.definition}</p>
      {term.formula && <p className="rounded-xl bg-sunken px-3 py-2 font-mono text-[13px] text-ink-2">{term.formula}</p>}
      {term.reads && (
        <dl className="grid gap-2 text-[15px] leading-relaxed">
          <div className="rounded-2xl bg-good-soft px-4 py-3">
            <dt className="text-xs font-extrabold uppercase tracking-[0.12em] text-good-ink">When it rises</dt>
            <dd className="mt-0.5 text-ink-2">{term.reads.up}</dd>
          </div>
          <div className="rounded-2xl bg-bad-soft px-4 py-3">
            <dt className="text-xs font-extrabold uppercase tracking-[0.12em] text-bad-ink">When it falls</dt>
            <dd className="mt-0.5 text-ink-2">{term.reads.down}</dd>
          </div>
        </dl>
      )}
      {term.examples.slice(0, showExamples).map((ex) => (
        <figure key={ex} className="rounded-2xl border-l-4 border-brand bg-brand-soft/60 px-4 py-3">
          <p className="text-[15px] leading-relaxed text-ink-2">“{ex}”</p>
        </figure>
      ))}
      {term.note && <p className="text-sm leading-relaxed text-ink-3">{term.note}</p>}
    </div>
  );
}

/** Just a term's definition, fetched like TermDetails when the learner has met it. */
export function TermDefinition({ term, met }: { term: Term; met: boolean }) {
  useTermCards(met ? [term.id] : []);
  if (hasCard(term.id)) return <p className="mt-1 text-[15px]">{term.definition}</p>;
  return <div className="mt-2">{met ? <CardLoading /> : <NotReached term={term} />}</div>;
}

/** In place of a met term's card while it is fetched. */
export function CardLoading() {
  return <p className="animate-pulse rounded-2xl bg-sunken px-4 py-3 text-[15px] text-ink-3">Getting this term…</p>;
}

/** In place of a term's card before the learner reaches it: where it comes, nothing of what it says. */
export function NotReached({ term }: { term: Term }) {
  const unit = unitById.get(term.unit);
  const area = categoryOfTerm.get(term.id);
  return (
    <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-[15px] leading-relaxed text-ink-3">
      You haven’t reached this term yet. It comes in <b className="text-ink-2">{unit?.name ?? 'a later unit'}</b>
      {area ? `, in ${area.name}` : ''}, and opens here once you meet it.
    </p>
  );
}

/** In-app confirmation, used instead of window.confirm (which some embedded views block). */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 backdrop-blur-[2px] sm:items-center" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="w-full max-w-sm animate-pop rounded-3xl bg-surface p-6 shadow-xl">
        <p id="confirm-title" className="text-lg font-extrabold text-ink">
          {title}
        </p>
        {body && <p className="mt-2 leading-relaxed text-ink-2">{body}</p>}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** A number with − and + buttons, for prices on a grid. */
export function Stepper({ label, value, onDown, onUp }: { label: string; value: number; onDown: () => void; onUp: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2">
      <span className="flex-1 text-sm font-bold text-ink-2">{label}</span>
      <button type="button" onClick={onDown} aria-label={`${label}: lower`} className="h-11 w-11 rounded-xl bg-sunken text-xl font-extrabold text-ink-2 active:translate-y-[1px]">
        −
      </button>
      <span className="num w-14 text-center text-2xl font-extrabold text-ink" aria-label={label}>
        {Number.isInteger(value) ? String(value) : value.toFixed(1)}
      </span>
      <button type="button" onClick={onUp} aria-label={`${label}: raise`} className="h-11 w-11 rounded-xl bg-sunken text-xl font-extrabold text-ink-2 active:translate-y-[1px]">
        +
      </button>
    </div>
  );
}
