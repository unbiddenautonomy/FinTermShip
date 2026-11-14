/** The mode switcher and the KPI strip. Kept apart from the term sheet so Path's Home doesn't load the metro map. */
import { useState } from 'react';
import { MORE_MODES, SWITCHER } from '../../lib/modes/ids';
import { kpis, type ModeId } from '../../lib/modes/knowledge';
import { currentStreak } from '../../lib/scheduler';
import type { Progress } from '../../lib/types';
import { Bolt, CallIcon, Flame, GridIcon, LinesIcon, MoreIcon, PaperIcon, PathIcon, TickerIcon } from '../icons';
import { useModeAccess } from './modeAccess';
import { MoreSheet } from './MoreSheet';

export const MODE_INFO: Record<ModeId, { label: string; blurb: string; icon: typeof PathIcon }> = {
  path: { label: 'Path', blurb: 'Lessons in order, with drills, games and tests.', icon: PathIcon },
  lines: { label: 'Lines', blurb: 'Ride the syllabus as a metro: one line per area, one station per term.', icon: LinesIcon },
  callit: { label: 'Call It', blurb: 'Quick true or false calls on terms you have met.', icon: CallIcon },
  exchange: { label: 'Exchange', blurb: 'Every term you know is a stock, priced at how firmly you hold it.', icon: TickerIcon },
  headline: { label: 'Headline Desk', blurb: 'A headline breaks. Call which way each thing moves, then read why.', icon: PaperIcon },
  finnections: { label: 'Finnections', blurb: 'Sixteen terms, four hidden groups of four. Watch for the traps.', icon: GridIcon },
};

const KPI_HELP: { key: string; text: string }[] = [
  { key: 'Known', text: 'Terms answered well over several days, of every term open to you. Only questions where you produce or use the term can make one Known.' },
  { key: 'Due', text: 'Terms ready for a review today. Any mode can clear them: a Path review, a ride past the station, defending the stock, or a call.' },
  { key: 'Strength', text: 'How firmly you hold the terms you have met, 0 to 100. It fades when a review is overdue, never below 5. On the Exchange it is the price of a term.' },
  { key: 'Coverage', text: 'Share of open terms you have met at least once, in any mode.' },
];

/** The four shared numbers and the mode switcher. Same numbers, same words, on every mode. */
export function ModeBar({ progress, today, mode, onMode }: { progress: Progress; today: string; mode: ModeId; onMode: (m: ModeId) => void }) {
  const k = kpis(progress, today);
  const streak = currentStreak(progress, today);
  const [help, setHelp] = useState(false);
  const [more, setMore] = useState(false);
  const { shown, isOff } = useModeAccess();
  const main = shown.filter((m) => SWITCHER.includes(m));
  const extra = shown.filter((m) => MORE_MODES.includes(m));
  const inMore = MORE_MODES.includes(mode);
  return (
    <div className="space-y-3">
      <nav
        className="grid gap-1 rounded-2xl border border-line bg-surface p-1 shadow-card"
        style={{ gridTemplateColumns: `repeat(${main.length}, minmax(0, 1fr))${extra.length ? ' auto' : ''}` }}
        aria-label="Modes"
      >
        {main.map((m) => {
          const { label, icon: Icon } = MODE_INFO[m];
          const active = m === mode;
          // Only the admin ever sees a switched-off mode here, marked so it's clear learners don't.
          const off = isOff(m);
          return (
            <button
              key={m}
              type="button"
              onClick={() => onMode(m)}
              aria-current={active ? 'page' : undefined}
              title={off ? `${MODE_INFO[m].blurb} Switched off for learners.` : MODE_INFO[m].blurb}
              className={`relative flex items-center justify-center gap-1.5 rounded-xl px-1 py-2 text-[13px] font-extrabold transition sm:text-sm ${active ? 'bg-brand text-white' : 'text-ink-2 hover:bg-sunken'} ${off && !active ? 'opacity-60' : ''}`}
            >
              <Icon className="hidden h-4 w-4 shrink-0 min-[400px]:block" />
              {label}
              {off && <span className="absolute -top-1 right-0.5 rounded bg-ink px-1 text-[9px] font-extrabold uppercase leading-4 tracking-wider text-bg">off</span>}
            </button>
          );
        })}
        {extra.length > 0 && (
          <button
            type="button"
            onClick={() => setMore(true)}
            aria-haspopup="dialog"
            aria-current={inMore ? 'page' : undefined}
            title="More modes"
            className={`flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-[13px] font-extrabold transition sm:text-sm ${inMore ? 'bg-brand text-white' : 'text-ink-2 hover:bg-sunken'}`}
          >
            <MoreIcon className="h-4 w-4 shrink-0" />
            <span className={inMore ? 'hidden sm:inline' : 'sr-only sm:not-sr-only'}>{inMore ? MODE_INFO[mode].label : 'More'}</span>
          </button>
        )}
      </nav>
      {more && <MoreSheet progress={progress} today={today} modes={extra} current={mode} onClose={() => setMore(false)} onMode={(m) => { setMore(false); onMode(m); }} />}
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

