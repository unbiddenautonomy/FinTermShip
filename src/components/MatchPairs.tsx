import { useEffect, useRef, useState } from 'react';
import { termById } from '../lib/content';

interface Props {
  termIds: string[];
  /** The meanings, in the order shown. */
  right: string[];
  /** Whether the term at `left` goes with the meaning at `right`: the server checks each pair. */
  check: (left: number, right: number) => Promise<boolean>;
  onDone: (mistakes: Record<string, number>) => void;
}

/** Tap a term, then its meaning. Wrong pairs flash red and count as a mistake for that term. */
export function MatchPairs({ termIds, right, check, onDone }: Props) {
  const [left, setLeft] = useState<number | null>(null);
  /** Matched pairs: term index to meaning index. */
  const [matched, setMatched] = useState<Map<number, number>>(new Map());
  const [flash, setFlash] = useState<{ l: number; r: number } | null>(null);
  /** The pair just matched: it glows green and swells for a moment before it greys out. */
  const [hit, setHit] = useState<{ l: number; r: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mistakes = useRef<Record<string, number>>({});
  const doneRef = useRef(false);

  useEffect(() => {
    if (matched.size === termIds.length && !doneRef.current) {
      doneRef.current = true;
      const t = setTimeout(() => onDone(mistakes.current), 450);
      return () => clearTimeout(t);
    }
  }, [matched, termIds.length, onDone]);

  const taken = new Set(matched.values());
  const pickRight = async (r: number) => {
    if (left === null || taken.has(r) || busy) return;
    const l = left;
    setBusy(true);
    setError(null);
    try {
      if (await check(l, r)) {
        setMatched((m) => new Map(m).set(l, r));
        setHit({ l, r });
        setTimeout(() => setHit((h) => (h?.l === l ? null : h)), 520);
      } else {
        const id = termIds[l];
        mistakes.current[id] = (mistakes.current[id] ?? 0) + 1;
        setFlash({ l, r });
        setTimeout(() => setFlash(null), 500);
      }
      setLeft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const base = 'w-full min-h-[3.75rem] rounded-2xl border-2 px-3 py-3 text-left text-sm font-bold leading-snug transition';
  const idle = 'border-line bg-surface text-ink shadow-press-line active:translate-y-[1px] active:shadow-none';
  const sel = 'border-sky bg-sky-soft text-sky-ink';
  const ok = 'border-transparent bg-sunken text-ink-3/60';
  const bad = 'animate-shake border-bad bg-bad-soft text-bad-ink';
  const glow = 'animate-bump-halo border-good bg-good-soft text-good-ink';

  return (
    <div>
      <div className="grid grid-cols-[2fr_3fr] gap-3">
        <div className="space-y-3">
          {termIds.map((id, i) => {
            const done = matched.has(i);
            const style = hit?.l === i ? glow : done ? ok : flash?.l === i ? bad : left === i ? sel : idle;
            return (
              <button key={id} type="button" disabled={done} onClick={() => setLeft(i)} className={`${base} ${style}`} aria-pressed={left === i}>
                {termById.get(id)?.term}
              </button>
            );
          })}
        </div>
        <div className="space-y-3">
          {right.map((text, r) => {
            const done = taken.has(r);
            const style = hit?.r === r ? glow : done ? ok : flash?.r === r ? bad : idle;
            return (
              <button key={r} type="button" disabled={done || left === null || busy} onClick={() => void pickRight(r)} className={`${base} ${style} font-semibold`}>
                {text}
              </button>
            );
          })}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-4 text-sm font-bold text-bad-ink">
          {error}
        </p>
      )}
      <p className="mt-5 text-sm text-ink-3">Tap a term on the left, then its meaning on the right.</p>
    </div>
  );
}
