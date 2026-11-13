/** The mode switcher and the KPI strip. Kept apart from the term sheet so Path's Home doesn't load the metro map. */
import { useState } from 'react';
import { kpis, MODES, type ModeId } from '../../lib/modes/knowledge';
import { currentStreak } from '../../lib/scheduler';
import type { Progress } from '../../lib/types';
import { CallIcon, Flame, LinesIcon, PathIcon, TickerIcon } from '../icons';

export const MODE_INFO: Record<ModeId, { label: string; blurb: string; icon: typeof PathIcon }> = {
  path: { label: 'Path', blurb: 'Lessons in order, with drills, games and tests.', icon: PathIcon },
  lines: { label: 'Lines', blurb: 'Ride the syllabus as a metro: one line per area, one station per term.', icon: LinesIcon },
  callit: { label: 'Call It', blurb: 'Quick true or false calls on terms you have met.', icon: CallIcon },
  exchange: { label: 'Exchange', blurb: 'Every term you know is a stock, priced at how firmly you hold it.', icon: TickerIcon },
};

const KPI_HELP: { key: string; text: string }[] = [
  { key: 'Known', text: 'Terms answered well over several days, of every term open to you. Only questions where you produce or use the term can make one Known.' },
  { key: 'Due', text: 'Terms ready for a review today. Any mode can clear them: a Path review, a ride past the station, defending the stock, or a call.' },
  { key: 'Strength', text: 'How firmly you hold the terms you have met, 0 to 100. It fades when a review is overdue. The Exchange index is this number.' },
  { key: 'Coverage', text: 'Share of open terms you have met at least once, in any mode.' },
];

/** The four shared numbers and the mode switcher. Same numbers, same words, on every mode. */
export function ModeBar({ progress, today, mode, onMode }: { progress: Progress; today: string; mode: ModeId; onMode: (m: ModeId) => void }) {
  const k = kpis(progress, today);
  const streak = currentStreak(progress, today);
  const [help, setHelp] = useState(false);
  return (
    <div className="space-y-3">
      <nav className="grid grid-cols-4 gap-1 rounded-2xl border border-line bg-surface p-1 shadow-card" aria-label="Modes">
        {MODES.map((m) => {
          const { label, icon: Icon } = MODE_INFO[m];
          const active = m === mode;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onMode(m)}
              aria-current={active ? 'page' : undefined}
              title={MODE_INFO[m].blurb}
              className={`flex items-center justify-center gap-1.5 rounded-xl px-1 py-2 text-[13px] font-extrabold transition sm:text-sm ${active ? 'bg-brand text-white' : 'text-ink-2 hover:bg-sunken'}`}
            >
              <Icon className="hidden h-4 w-4 shrink-0 min-[400px]:block" />
              {label}
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
        <span className={`num inline-flex items-center gap-1 self-center rounded-full px-2.5 py-1 text-sm font-extrabold ${streak ? 'bg-amber-soft text-amber-ink' : 'bg-sunken text-ink-3'}`} aria-label={`${streak} day streak`}>
          <Flame className="h-3.5 w-3.5" />
          {streak}
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

