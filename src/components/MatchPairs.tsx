import { useEffect, useRef, useState } from 'react';
import { termById } from '../lib/content';
import { tidyOption } from '../lib/questions';

interface Props {
  termIds: string[];
  right: string[];
  onDone: (mistakes: Record<string, number>) => void;
}

/** Tap a term, then its meaning. Wrong pairs flash red and count as a mistake for that term. */
export function MatchPairs({ termIds, right, onDone }: Props) {
  const [left, setLeft] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [flash, setFlash] = useState<{ l: string; r: string } | null>(null);
  const mistakes = useRef<Record<string, number>>({});
  const doneRef = useRef(false);

  useEffect(() => {
    if (matched.length === termIds.length && !doneRef.current) {
      doneRef.current = true;
      const t = setTimeout(() => onDone(mistakes.current), 450);
      return () => clearTimeout(t);
    }
  }, [matched, termIds.length, onDone]);

  const pickRight = (id: string) => {
    if (!left || matched.includes(id)) return;
    if (left === id) {
      setMatched((m) => [...m, id]);
      setLeft(null);
    } else {
      mistakes.current[left] = (mistakes.current[left] ?? 0) + 1;
      setFlash({ l: left, r: id });
      setTimeout(() => setFlash(null), 500);
      setLeft(null);
    }
  };

  const base = 'w-full rounded-2xl border-2 px-3 py-3 text-left text-sm font-semibold transition min-h-[3.5rem]';
  const idle = 'border-slate-200 bg-white text-slate-800 shadow-[0_3px_0_0_#e2e8f0] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:shadow-[0_3px_0_0_#334155]';
  const sel = 'border-sky-400 bg-sky-50 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200';
  const ok = 'border-transparent bg-slate-100 text-slate-300 dark:bg-slate-800/40 dark:text-slate-600';
  const bad = 'border-rose-400 bg-rose-50 text-rose-700 dark:bg-[#2b0a12] dark:text-rose-300';

  return (
    <div>
      <p className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Match the pairs</p>
      <div className="grid grid-cols-[2fr_3fr] gap-3">
        <div className="space-y-3">
          {termIds.map((id) => {
            const done = matched.includes(id);
            const style = done ? ok : flash?.l === id ? bad : left === id ? sel : idle;
            return (
              <button key={id} type="button" disabled={done} onClick={() => setLeft(id)} className={`${base} ${style}`}>
                {termById.get(id)?.term}
              </button>
            );
          })}
        </div>
        <div className="space-y-3">
          {right.map((id) => {
            const done = matched.includes(id);
            const style = done ? ok : flash?.r === id ? bad : idle;
            return (
              <button key={id} type="button" disabled={done || !left} onClick={() => pickRight(id)} className={`${base} ${style} font-medium`}>
                {tidyOption(termById.get(id)?.short ?? '')}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Tap a term on the left, then its meaning on the right.</p>
    </div>
  );
}
