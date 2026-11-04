import type { ReactNode } from 'react';
import { canSpeak, speakTerm } from '../lib/speech';
import type { Term } from '../lib/types';

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
      'bg-brand-500 text-white shadow-[0_4px_0_0_#027a48] active:translate-y-[2px] active:shadow-[0_2px_0_0_#027a48] hover:bg-brand-600 disabled:bg-slate-300 disabled:shadow-none dark:disabled:bg-slate-700',
    secondary:
      'bg-white text-slate-800 border-2 border-slate-200 shadow-[0_3px_0_0_#e2e8f0] active:translate-y-[2px] active:shadow-none hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700 dark:shadow-[0_3px_0_0_#334155] dark:hover:bg-slate-700',
    ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-2xl px-5 py-3 font-bold tracking-wide transition disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Bar({ value, max, className = '', tone = 'brand' }: { value: number; max: number; className?: string; tone?: 'brand' | 'sky' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const fill = tone === 'brand' ? 'bg-brand-500' : 'bg-sky-500';
  return (
    <div className={`h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700 ${className}`} role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className={`h-full rounded-full ${fill} transition-all duration-300`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function SpeakButton({ term, enabled }: { term: Term; enabled: boolean }) {
  if (!enabled || !canSpeak()) return null;
  return (
    <button
      type="button"
      onClick={() => speakTerm(term)}
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700 hover:bg-sky-200 dark:bg-sky-900/50 dark:text-sky-300"
      aria-label={`Hear "${term.term}"`}
      title="Hear it"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H2v6h4l5 4V5Z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M19 5a10 10 0 0 1 0 14" />
      </svg>
    </button>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl border-2 border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800 ${className}`}>{children}</div>;
}

export function TermDetails({ term, showExamples = 2 }: { term: Term; showExamples?: number }) {
  return (
    <div className="space-y-3 text-slate-700 dark:text-slate-200">
      <p className="text-lg leading-snug">{term.definition}</p>
      {term.formula && (
        <p className="rounded-xl bg-slate-100 px-3 py-2 font-mono text-sm dark:bg-slate-900">{term.formula}</p>
      )}
      {term.examples.slice(0, showExamples).map((ex) => (
        <p key={ex} className="border-l-4 border-brand-400 pl-3 italic text-slate-600 dark:text-slate-300">
          “{ex}”
        </p>
      ))}
      {term.note && <p className="text-sm text-slate-500 dark:text-slate-400">{term.note}</p>}
    </div>
  );
}
