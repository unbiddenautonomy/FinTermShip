/** The mode switch and the KPI strip. Kept apart from the term sheet so Path's Home doesn't load the metro map. */
import { useCallback, useState } from 'react';
import { kpis, type ModeId } from '../../lib/modes/knowledge';
import { currentStreak } from '../../lib/scheduler';
import type { Progress } from '../../lib/types';
import { Bolt, CallIcon, Flame, GridIcon, LinesIcon, PaperIcon, PathIcon, TickerIcon } from '../icons';
import { useModeAccess } from './modeAccess';
import { ModePicker, ModeSwitch, statOf, type ModeInfo } from './ModePicker';

export const MODE_INFO: Record<ModeId, ModeInfo> = {
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

/** The mode switch and the four shared numbers. Same numbers, same words, on every mode. */
export function ModeBar({ progress, today, mode, onMode }: { progress: Progress; today: string; mode: ModeId; onMode: (m: ModeId) => void }) {
  const k = kpis(progress, today);
  const streak = currentStreak(progress, today);
  const [help, setHelp] = useState(false);
  const [picking, setPicking] = useState(false);
  const { shown, isOff } = useModeAccess();
  const close = useCallback(() => setPicking(false), []);
  const pick = useCallback(
    (m: ModeId) => {
      setPicking(false);
      onMode(m);
    },
    [onMode],
  );
  const badges = (
    <>
      <span className={`num inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-extrabold ${streak ? 'bg-amber-soft text-amber-ink' : 'bg-sunken text-ink-3'}`} aria-label={`${streak} day streak`} title="Days in a row">
        <Flame className="h-3.5 w-3.5" />
        {streak}
      </span>
      <span className="num inline-flex items-center gap-1 rounded-full bg-violet-soft px-2.5 py-1 text-sm font-extrabold text-violet-ink" aria-label={`${progress.xp} XP`} title="XP">
        <Bolt className="h-3.5 w-3.5" />
        {progress.xp}
      </span>
    </>
  );
  const share = (n: number) => (k.met ? (n / k.met) * 100 : 0);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[17.5rem_minmax(0,1fr)]">
        {/* min-w-0 on both rows: without it the mode name and the four numbers set a floor
            wider than a phone, and body's overflow clip cuts the right-hand edge off. */}
        <div className="flex min-w-0 items-center gap-2 lg:items-stretch">
          <ModeSwitch mode={mode} info={MODE_INFO[mode]} stat={statOf(progress, mode, k)} onOpen={() => setPicking(true)} />
          <span className="flex shrink-0 flex-col items-end gap-1 lg:hidden">{badges}</span>
        </div>
        <button
          type="button"
          onClick={() => setHelp((h) => !h)}
          aria-expanded={help}
          aria-label="What these numbers mean"
          className="block w-full min-w-0 rounded-2xl border border-line bg-surface px-4 pb-3 pt-2.5 text-left shadow-card transition hover:border-brand/30"
        >
          <span className="grid grid-cols-[repeat(4,minmax(0,1fr))_auto] items-end gap-2">
            <Kpi label="Known" value={`${k.known}`} sub={`/${k.open}`} />
            <Kpi label="Due" value={`${k.due}`} tone={k.due > 0 ? 'text-amber-ink' : undefined} />
            <Kpi label="Strength" value={k.strength.toFixed(1)} />
            <Kpi label="Coverage" value={`${Math.round(k.coverage * 100)}%`} />
            <span className="hidden items-center gap-1.5 self-center lg:flex">{badges}</span>
          </span>
          {/* Every met term is exactly one of these three, so the bar always fills. */}
          <span className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-sunken" role="img" aria-label={`Of ${k.met} terms met: ${k.known} known, ${k.due} due, ${k.learning} learning`}>
            {k.met > 0 && (
              <span className="flex h-full w-full origin-left animate-grow gap-[2px]">
                {k.known > 0 && <span className="h-full rounded-full bg-brand" style={{ width: `${share(k.known)}%` }} />}
                {k.due > 0 && <span className="h-full rounded-full bg-amber" style={{ width: `${share(k.due)}%` }} />}
                {k.learning > 0 && <span className="h-full rounded-full bg-brand/30" style={{ width: `${share(k.learning)}%` }} />}
              </span>
            )}
          </span>
          <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-bold text-ink-3">
            <Legend dot="bg-brand" n={k.known} label="known" />
            <Legend dot="bg-amber" n={k.due} label="due" />
            <Legend dot="bg-brand/30" n={k.learning} label="learning" />
            <span className="ml-auto hidden sm:inline">of {k.met} met</span>
          </span>
        </button>
      </div>
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
      {picking && <ModePicker progress={progress} k={k} modes={shown} current={mode} info={MODE_INFO} isOff={isOff} onPick={pick} onClose={close} />}
    </div>
  );
}

function Legend({ dot, n, label }: { dot: string; n: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <span className="num font-mono text-ink-2">{n}</span> {label}
    </span>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <span className="min-w-0">
      <span className="block truncate text-[10px] font-extrabold uppercase tracking-[0.1em] text-ink-3">{label}</span>
      <span className={`num block truncate font-mono text-lg font-semibold leading-tight ${tone ?? 'text-ink'}`}>
        {value}
        {sub && <span className="text-xs text-ink-3">{sub}</span>}
      </span>
    </span>
  );
}

