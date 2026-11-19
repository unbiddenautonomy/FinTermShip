/**
 * The mode switch: one button that says which mode you're in, and a picker that opens over the
 * screen with every mode as a card drawn in its own look. Keys 1 to 6 pick a mode, Escape closes.
 */
import { useEffect, useRef, type CSSProperties } from 'react';
import type { ModeId } from '../../lib/modes/ids';
import { modeRecord, type Kpis } from '../../lib/modes/knowledge';
import { access, isRoundMode, levelState } from '../../lib/modes/rounds';
import type { Progress } from '../../lib/types';
import { ChevronDown, Cross, Lock } from '../icons';
import { MODE_ART, MODE_LOOK } from './ModeArt';
import type { PathIcon } from '../icons';

export interface ModeInfo {
  label: string;
  short?: string;
  blurb: string;
  icon: typeof PathIcon;
}

interface Gate {
  open: boolean;
  gap: number;
}

export function gateOf(m: ModeId): Gate {
  if (!isRoundMode(m)) return { open: true, gap: 0 };
  // Until the server has said, the mode can be opened: its screen waits for the answer.
  const a = access(m);
  return a.known ? a : { open: true, gap: 0 };
}

/** One live line per mode, read from the shared record. */
export function statOf(p: Progress, m: ModeId, k: Kpis): string {
  const r = modeRecord(p, m);
  switch (m) {
    case 'path':
      return k.due ? `${k.due} due today` : k.met ? `${k.met} terms met` : 'Start here';
    case 'lines':
      return k.due ? `${k.due} stations due` : `${Math.round(k.coverage * 100)}% ridden`;
    case 'callit':
      return r.bestRun ? `Best run ${r.bestRun}` : 'No run yet';
    case 'exchange':
      // The index is Strength × Coverage × 10 (see exchange.ts), so it is read here without loading the market.
      return `Index ${(k.strength * k.coverage * 10).toFixed(1)}`;
    case 'headline':
    case 'finnections': {
      if (!access(m).known) return 'Checking…';
      const g = gateOf(m);
      return g.open ? `Level ${levelState(p, m).level}` : `${g.gap} term${g.gap === 1 ? '' : 's'} to go`;
    }
  }
}

/** The button that stands for the current mode. */
export function ModeSwitch({ mode, info, stat, onOpen }: { mode: ModeId; info: ModeInfo; stat: string; onOpen: () => void }) {
  const look = MODE_LOOK[mode];
  const Icon = info.icon;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className="group flex h-full w-full min-w-0 items-center gap-2.5 rounded-2xl border border-line bg-surface p-2 pr-2.5 text-left sm:gap-3 sm:pr-3 shadow-card transition hover:-translate-y-0.5 hover:shadow-[0_6px_18px_-8px_rgb(20_40_30/0.35)] active:translate-y-0"
    >
      <span className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl sm:h-12 sm:w-12" style={{ background: look.tile, color: look.ink }}>
        <span className="absolute inset-0 opacity-40 [&_svg]:h-full [&_svg]:w-full" aria-hidden="true">
          {MODE_ART[mode]}
        </span>
        <span className="relative grid h-8 w-8 place-items-center rounded-lg" style={{ background: look.tile }}>
          <Icon className="h-5 w-5" />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-extrabold uppercase tracking-[0.14em] text-ink-3">Mode</span>
        <span className="block truncate font-display text-xl font-semibold leading-tight text-ink">{info.label}</span>
        <span className="block truncate text-xs font-semibold text-ink-3">{stat}</span>
      </span>
      {/* On a narrow phone the word gives way to the chevron, so the mode's name has room to show
          in full; it stays in the button's name, which is what the whole button reads out as. */}
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-sunken px-2 py-1 text-xs font-extrabold text-ink-2 transition group-hover:bg-brand group-hover:text-white sm:px-2.5">
        <span className="sr-only sm:not-sr-only">Switch</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

/** Every mode as a card in its own look. */
export function ModePicker({
  progress,
  k,
  modes,
  current,
  info,
  isOff,
  onPick,
  onClose,
}: {
  progress: Progress;
  k: Kpis;
  modes: ModeId[];
  current: ModeId;
  info: Record<ModeId, ModeInfo>;
  isOff: (m: ModeId) => boolean;
  onPick: (m: ModeId) => void;
  onClose: () => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  // Read through a ref: the picker sets focus up once, and a redraw must not pull focus back.
  const live = useRef({ modes, onClose, onPick });
  live.current = { modes, onClose, onPick };
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const { modes, onClose, onPick } = live.current;
      if (e.key === 'Escape') return onClose();
      if (e.key === 'Tab') {
        // Keep the keyboard inside the picker: behind it is the page the learner is choosing from.
        const inside = [...(sheet.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])];
        if (!inside.length) return;
        e.preventDefault();
        const at = inside.indexOf(document.activeElement as HTMLElement);
        const step = e.shiftKey ? -1 : 1;
        inside[(at + step + inside.length) % inside.length].focus();
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= modes.length) {
        e.preventDefault();
        e.stopPropagation();
        onPick(modes[n - 1]);
      }
    };
    // Capture, so the number keys pick a mode here instead of answering a question behind the picker.
    window.addEventListener('keydown', onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      // Back to the button that opened it, so the keyboard carries on from where it was.
      opener?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0B1410]/55 backdrop-blur-sm animate-fade sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="mode-picker-title" onClick={onClose}>
      <div ref={sheet} className="max-h-[92dvh] w-full max-w-4xl animate-sheet overflow-y-auto rounded-t-[28px] bg-bg shadow-sheet sm:animate-pop sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 bg-bg/95 px-5 pb-3 pt-5 backdrop-blur sm:px-7 sm:pt-6">
          <div>
            <h2 id="mode-picker-title" className="font-display text-[28px] font-semibold leading-tight tracking-tight text-ink">
              Pick a mode
            </h2>
            <p className="text-sm text-ink-3">Six ways in, one record of what you know.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-sunken p-2 text-ink-2 hover:bg-line" aria-label="Close">
            <Cross className="h-5 w-5" />
          </button>
        </div>
        <ul className="grid grid-cols-2 gap-3 px-4 pb-6 sm:gap-4 sm:px-7 sm:pb-7 lg:grid-cols-3">
          {modes.map((m, i) => {
            const look = MODE_LOOK[m];
            const gate = gateOf(m);
            const here = m === current;
            const { label, blurb, icon: Icon } = info[m];
            const stat = statOf(progress, m, k);
            // How close a locked mode is: the share of the way there, by terms still to meet.
            const near = gate.open ? 1 : Math.max(0.08, 1 - gate.gap / Math.max(gate.gap + 4, 12));
            return (
              <li key={m} className="animate-rise" style={{ animationDelay: `${40 + i * 45}ms` } as CSSProperties}>
                <button
                  ref={i === 0 ? first : undefined}
                  type="button"
                  onClick={() => onPick(m)}
                  aria-current={here ? 'page' : undefined}
                  aria-label={`${label}${gate.open ? '' : `, opens after ${gate.gap} more terms`}${here ? ', current mode' : ''}`}
                  className="group relative block h-full w-full overflow-hidden rounded-2xl bg-surface text-left shadow-card outline-none ring-offset-2 ring-offset-bg transition duration-200 hover:-translate-y-1 hover:shadow-[0_14px_30px_-14px_rgb(20_40_30/0.45)] focus-visible:ring-2 focus-visible:ring-brand"
                  style={here ? { boxShadow: `0 0 0 3px ${look.accent}` } : undefined}
                >
                  <span className={`relative block aspect-[5/2] overflow-hidden ${gate.open ? '' : 'grayscale-[0.85]'}`}>
                    <span className="block h-full w-full transition duration-300 group-hover:scale-[1.04]">{MODE_ART[m]}</span>
                    {here && <span className="absolute right-2.5 top-2.5 rounded-full px-2 text-[10px] font-extrabold uppercase leading-5 tracking-wider text-white" style={{ background: look.accent }}>You're here</span>}
                    {!gate.open && (
                      <span className="absolute inset-0 grid place-items-center bg-black/25">
                        <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#161616] shadow-card">
                          <Lock className="h-5 w-5" />
                        </span>
                      </span>
                    )}
                  </span>
                  <span className="relative block px-3 pb-3 pt-6 sm:px-4 sm:pb-4">
                    <span className="absolute -top-5 left-3 grid h-10 w-10 place-items-center rounded-xl shadow-card ring-4 ring-surface sm:left-4" style={{ background: look.tile, color: look.ink }}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="truncate text-base font-extrabold text-ink sm:text-lg">{label}</span>
                      <kbd className="ml-auto hidden rounded border border-line bg-sunken px-1.5 font-mono text-[11px] font-bold text-ink-3 lg:inline">{i + 1}</kbd>
                      {isOff(m) && <span className="rounded bg-ink px-1 text-[9px] font-extrabold uppercase leading-4 tracking-wider text-bg">off</span>}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-snug text-ink-3 sm:text-sm">{blurb}</span>
                    {gate.open ? (
                      <span className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-extrabold" style={{ background: `${look.accent}1F`, color: look.accent }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'currentColor' }} />
                        {stat}
                      </span>
                    ) : (
                      <span className="mt-2 block">
                        <span className="block text-xs font-extrabold text-ink-2">{stat}</span>
                        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-sunken">
                          <span className="block h-full rounded-full" style={{ width: `${near * 100}%`, background: look.accent }} />
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
  );
}
