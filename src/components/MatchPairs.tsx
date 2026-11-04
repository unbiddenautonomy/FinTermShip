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

  const base = 'w-full min-h-[3.75rem] rounded-2xl border-2 px-3 py-3 text-left text-sm font-bold leading-snug transition';
  const idle = 'border-line bg-surface text-ink shadow-press-line active:translate-y-[1px] active:shadow-none';
  const sel = 'border-sky bg-sky-soft text-sky-ink';
  const ok = 'border-transparent bg-sunken text-ink-3/60';
  const bad = 'animate-shake border-bad bg-bad-soft text-bad-ink';

  return (
    <div>
      <div className="grid grid-cols-[2fr_3fr] gap-3">
        <div className="space-y-3">
          {termIds.map((id) => {
            const done = matched.includes(id);
            const style = done ? ok : flash?.l === id ? bad : left === id ? sel : idle;
            return (
              <button key={id} type="button" disabled={done} onClick={() => setLeft(id)} className={`${base} ${style}`} aria-pressed={left === id}>
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
              <button key={id} type="button" disabled={done || !left} onClick={() => pickRight(id)} className={`${base} ${style} font-semibold`}>
                {tidyOption(termById.get(id)?.short ?? '')}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-5 text-sm text-ink-3">Tap a term on the left, then its meaning on the right.</p>
    </div>
  );
}
