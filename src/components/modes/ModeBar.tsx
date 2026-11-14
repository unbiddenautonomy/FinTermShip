/** The mode switcher and the KPI strip. Kept apart from the term sheet so Path's Home doesn't load the metro map. */
import { useState, type CSSProperties } from 'react';
import { kpis, type ModeId } from '../../lib/modes/knowledge';
import { currentStreak } from '../../lib/scheduler';
import type { Progress } from '../../lib/types';
import { access, isRoundMode } from '../../lib/modes/rounds';
import { Bolt, CallIcon, Flame, GridIcon, LinesIcon, Lock, PaperIcon, PathIcon, TickerIcon } from '../icons';
import { useModeAccess } from './modeAccess';

export const MODE_INFO: Record<ModeId, { label: string; short?: string; blurb: string; icon: typeof PathIcon }> = {
  path: { label: 'Path', blurb: 'Lessons in order, with drills, games and tests.', icon: PathIcon },
  lines: { label: 'Lines', blurb: 'Ride the syllabus as a metro: one line per area, one station per term.', icon: LinesIcon },
  callit: { label: 'Call It', blurb: 'Quick true or false calls on terms you have met.', icon: CallIcon },
  exchange: { label: 'Exchange', blurb: 'Every term you know is a stock, priced at how firmly you hold it.', icon: TickerIcon },
  headline: { label: 'Headline Desk', short: 'Headlines', blurb: 'A headline breaks. Call which way each thing moves, then read why.', icon: PaperIcon },
  finnections: { label: 'Finnections', blurb: 'Sixteen terms, four hidden groups of four. Watch for the traps.', icon: GridIcon },
};

const KPI_HELP: { key: string; text: string }[] = [
  { key: 'Known', text: 'Terms answered well over several days and not waiting on a review, of every term open to you. Only questions where you produce or use the term can make one Known. A Known term that falls due counts as Due until you review it.' },
  { key: 'Due', text: 'Met terms waiting on a review today: the amber stations on Lines and the falling stocks on the Exchange. A Path review, a Lines ride, defending a stock, a headline called right or a Finnections group found clears one. A true or false call in Call It is too easy to guess, so it only practises it.' },
  { key: 'Strength', text: 'How firmly you hold the terms you have met, 0 to 100. It fades once a review is overdue, never below 5. On the Exchange it is the average price.' },
  { key: 'Coverage', text: 'Share of open terms you have met at least once, in any mode. The Exchange index is Strength × Coverage × 10.' },
];

/** The four shared numbers and the mode switcher, with every mode in it. Same numbers, same words, on every mode. */
export function ModeBar({ progress, today, mode, onMode }: { progress: Progress; today: string; mode: ModeId; onMode: (m: ModeId) => void }) {
  const k = kpis(progress, today);
  const streak = currentStreak(progress, today);
  const [help, setHelp] = useState(false);
  const { shown, isOff } = useModeAccess();
  return (
    <div className="space-y-3">
      {/* Every mode sits in the switcher: three to a row on a phone, all six in one row from a tablet up. */}
      <nav className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-surface p-1 shadow-card sm:grid-cols-[repeat(var(--n),minmax(0,1fr))]" style={{ '--n': shown.length } as CSSProperties} aria-label="Modes">
        {shown.map((m) => {
          const { label, short, icon: Icon } = MODE_INFO[m];
          const active = m === mode;
          // Only the admin ever sees a switched-off mode here, marked so it's clear learners don't.
          const off = isOff(m);
          // Headline Desk and Finnections open once a full round only uses terms already met.
          const gate = isRoundMode(m) ? access(progress, m) : null;
          const locked = !!gate && !gate.open;
          const hint = locked ? `${MODE_INFO[m].blurb} Opens after ${gate.gap} more term${gate.gap === 1 ? '' : 's'}.` : MODE_INFO[m].blurb;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onMode(m)}
              aria-current={active ? 'page' : undefined}
              aria-label={locked ? `${label}, opens after ${gate.gap} more terms` : undefined}
              title={off ? `${hint} Switched off for learners.` : hint}
              className={`relative flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-1 py-2 text-[13px] font-extrabold transition sm:text-sm ${active ? 'bg-brand text-white' : 'text-ink-2 hover:bg-sunken'} ${(off || locked) && !active ? 'opacity-60' : ''}`}
            >
              {locked ? <Lock className="h-3.5 w-3.5 shrink-0" /> : <Icon className="hidden h-4 w-4 shrink-0 min-[400px]:block" />}
              <span className="truncate">{short ?? label}</span>
              {off && <span className="absolute -top-1 right-0.5 rounded bg-ink px-1 text-[9px] font-extrabold uppercase leading-4 tracking-wider text-bg">off</span>}
            </button>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={() => setHelp((h) => !h)}
        aria-expanded={help}
        className="grid w-full grid-cols-[repeat(4,minmax(0,1fr))_auto] items-end gap-2 rounded-2xl px-1 text-left"
        aria-label="What these numbers mean"
      >
        <Kpi label="Known" value={`${k.known}`} sub={`/${k.open}`} />
        <Kpi label="Due" value={`${k.due}`} tone={k.due > 0 ? 'text-amber-ink' : undefined} />
        <Kpi label="Strength" value={k.strength.toFixed(1)} />
        <Kpi label="Coverage" value={`${Math.round(k.coverage * 100)}%`} />
        <span className="flex flex-col items-end gap-1 self-center sm:flex-row sm:items-center">
          <span className={`num inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-extrabold sm:py-1 ${streak ? 'bg-amber-soft text-amber-ink' : 'bg-sunken text-ink-3'}`} aria-label={`${streak} day streak`} title="Days in a row">
            <Flame className="h-3.5 w-3.5" />
            {streak}
          </span>
          <span className="num inline-flex items-center gap-1 rounded-full bg-violet-soft px-2.5 py-0.5 text-sm font-extrabold text-violet-ink sm:py-1" aria-label={`${progress.xp} XP`} title="XP">
            <Bolt className="h-3.5 w-3.5" />
            {progress.xp}
          </span>
        </span>
      </button>
      {help && (
        <div className="animate-pop space-y-2 rounded-2xl bg-sunken px-4 py-3 text-sm leading-relaxed text-ink-2">
          {KPI_HELP.map((h) => (
            <p key={h.key}>
              <b className="text-ink">{h.key}.</b> {h.text}
            </p>
          ))}
          <p className="text-ink-3">These are the same in every mode, because every mode reads and writes the same record of what you know.</p>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <span className="min-w-0">
      <span className="block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-3">{label}</span>
      <span className={`num block truncate font-mono text-lg font-semibold leading-tight ${tone ?? 'text-ink'}`}>
        {value}
        {sub && <span className="text-xs text-ink-3">{sub}</span>}
      </span>
    </span>
  );
}

