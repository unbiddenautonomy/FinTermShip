/**
 * The More pop-up: the modes beyond the four in the switcher, each as a card that previews its
 * own colours and layout. A mode opens once the learner has met the terms a full round needs;
 * until then its card says how many more terms that takes.
 */
import { useEffect, type ReactNode } from 'react';
import type { ModeId } from '../../lib/modes/ids';
import { access, isRoundMode, levelState } from '../../lib/modes/rounds';
import type { Progress } from '../../lib/types';
import { Cross, Lock } from '../icons';
import { MODE_INFO } from './ModeBar';
import { useModeAccess } from './modeAccess';

export function MoreSheet({
  progress,
  modes,
  current,
  onClose,
  onMode,
}: {
  progress: Progress;
  today: string;
  modes: ModeId[];
  current: ModeId;
  onClose: () => void;
  onMode: (m: ModeId) => void;
}) {
  const { isOff } = useModeAccess();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="more-title" onClick={onClose}>
      <div className="max-h-[88dvh] w-full max-w-2xl animate-sheet overflow-y-auto rounded-t-3xl bg-surface shadow-sheet sm:animate-pop sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="more-title" className="font-display text-2xl font-semibold tracking-tight text-ink">
                More modes
              </h2>
              <p className="text-sm text-ink-3">Each one only uses terms you have met, so more of it opens as you learn. Same progress as everywhere else.</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-xl p-2 text-ink-3 hover:bg-sunken" aria-label="Close">
              <Cross className="h-5 w-5" />
            </button>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {modes.map((m) => {
              const round = isRoundMode(m);
              const a = round ? access(progress, m) : { open: true, gap: 0 };
              const level = round && a.open ? levelState(progress, m).level : null;
              const info = MODE_INFO[m];
              return (
                <li key={m}>
                  <button
                    type="button"
                    disabled={!a.open}
                    onClick={() => onMode(m)}
                    aria-current={m === current ? 'page' : undefined}
                    className={`group block w-full overflow-hidden rounded-2xl border text-left transition ${m === current ? 'border-brand ring-2 ring-brand/30' : 'border-line'} ${a.open ? 'hover:-translate-y-0.5 hover:shadow-card' : 'cursor-not-allowed'}`}
                  >
                    <span className={`block h-28 ${a.open ? '' : 'opacity-50 grayscale'}`}>{PREVIEW[m] ?? null}</span>
                    <span className="block space-y-0.5 px-4 py-3">
                      <span className="flex items-center gap-2 font-extrabold text-ink">
                        {info.label}
                        {isOff(m) && <span className="rounded bg-ink px-1 text-[9px] font-extrabold uppercase leading-4 tracking-wider text-bg">off</span>}
                        {level && <span className="ml-auto rounded-full bg-sunken px-2 py-0.5 font-mono text-xs font-semibold text-ink-2">Level {level}</span>}
                      </span>
                      {a.open ? (
                        <span className="block text-sm text-ink-3">{info.blurb}</span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-sm text-ink-3">
                          <Lock className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            Meet <b className="text-ink-2">{a.gap} more term{a.gap === 1 ? '' : 's'}</b> to open it.
                          </span>
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Each mode's card art, drawn in the colours and shapes of its own screen. */
const PREVIEW: Partial<Record<ModeId, ReactNode>> = {
  headline: (
    <svg viewBox="0 0 320 112" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true">
      <rect width="320" height="112" fill="#ecebe5" />
      <path d="M18 16h284M18 19h284" stroke="#161616" strokeWidth="1.2" />
      <rect x="18" y="26" width="200" height="11" fill="#161616" />
      <rect x="18" y="41" width="150" height="11" fill="#161616" />
      <rect x="18" y="58" width="120" height="4" fill="#8a887f" />
      {[70, 89].map((y, i) => (
        <g key={y}>
          <rect x="18" y={y} width="284" height="15" fill="#f7f6f2" stroke="#c9c7bd" />
          <rect x="26" y={y + 5.5} width={i ? 90 : 120} height="4" fill="#3d3d3d" />
          <rect x="236" y={y + 3} width="28" height="9" fill={i ? 'none' : '#1d6b45'} stroke={i ? '#161616' : '#1d6b45'} />
          <rect x="268" y={y + 3} width="28" height="9" fill={i ? '#b3261e' : 'none'} stroke={i ? '#b3261e' : '#161616'} />
        </g>
      ))}
    </svg>
  ),
  finnections: (
    <svg viewBox="0 0 320 112" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true">
      <rect width="320" height="112" fill="#f3f1fa" />
      <rect x="60" y="10" width="200" height="20" rx="6" fill="#f2c66d" />
      <rect x="120" y="17" width="80" height="5" rx="2" fill="#1a1625" opacity=".7" />
      {[0, 1, 2].map((r) =>
        [0, 1, 2, 3].map((c) => {
          const sel = (r === 0 && (c === 1 || c === 3)) || (r === 1 && c === 0);
          return <rect key={`${r}${c}`} x={60 + c * 51} y={36 + r * 24} width="47" height="20" rx="5" fill={sel ? '#3b3058' : '#e2def0'} />;
        }),
      )}
    </svg>
  ),
};
