/**
 * Term Lines: the syllabus drawn as a metro. One line per area, one station per term in the
 * order Path teaches them, a depot wherever a unit is a drill, game or case, and an
 * interchange wherever two terms on different lines are easily mixed up. The map is generated
 * from the syllabus, so no term is ever left off it.
 */
import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { unitOpen } from '../../lib/choose';
import { getCardsVersion, subscribeCards, termById, unitById } from '../../lib/content';
import { KIND_LABEL } from '../../lib/practice';
import { areaKpis, type ModeId } from '../../lib/modes/knowledge';
import { canRideFrom, dueStops, frontier, lines, lineById, namedTerms, REVISIT_MAX, rideRoute, RIDE_STOPS, stationCount, type Line, type Stop } from '../../lib/modes/plans';
import { areaOf, areas, STATUS_LABEL, termStatus, unitStatus, type TermStatus } from '../../lib/modes/status';
import { interchangesAt } from '../../lib/modes/transfer';
import type { Recipe } from '../../lib/session';
import type { PracticeKind, Progress } from '../../lib/types';
import { ArrowLeft, ChevronDown, LinesIcon, Lock } from '../icons';
import { Button } from '../ui';
import { NetworkMap } from './NetworkMap';
import { dashMask, glow, metal, metalRing } from './metal';
import { ModeFrame, TermDot, TermSheet } from './shared';

interface Props {
  progress: Progress;
  today: string;
  area: string | null;
  onArea: (a: string | null) => void;
  onMode: (m: ModeId) => void;
  onRun: (recipe: Recipe) => void;
  onDepot: (unitId: string) => void;
}

/** A unit's stops as rows: each named station and depot on its own, and each run of stations not named yet as one row. */
function runs(stops: Stop[], from: number): { stop: Stop; i: number; n: number }[] {
  const out: { stop: Stop; i: number; n: number }[] = [];
  stops.forEach((stop, k) => {
    const last = out[out.length - 1];
    const unnamed = 'term' in stop && !stop.term;
    if (unnamed && last && 'term' in last.stop && !last.stop.term) last.n++;
    else out.push({ stop, i: from + k, n: 1 });
  });
  return out;
}

const colourOf = (lineId: string) => areas[lineId]?.colour ?? 'rgb(var(--brand))';

export function TermLines({ progress, today, area, onArea, onMode, onRun, onDepot }: Props) {
  // Stations are named as their terms arrive from the server.
  useSyncExternalStore(subscribeCards, getCardsVersion);
  const line = area ? lineById.get(area) : undefined;
  return line ? (
    <LineView line={line} progress={progress} today={today} onBack={() => onArea(null)} onMode={onMode} onRun={onRun} onDepot={onDepot} />
  ) : (
    <Network progress={progress} today={today} onLine={onArea} onMode={onMode} />
  );
}

function Network({ progress, today, onLine, onMode }: { progress: Progress; today: string; onLine: (id: string) => void; onMode: (m: ModeId) => void }) {
  const stats = new Map(areaKpis(progress, today).map((a) => [a.id, a]));
  const isLocked = (l: Line) => l.units.every((u) => !unitOpen(progress, u.id));
  const open = lines.filter((l) => !isLocked(l));
  const shut = lines.filter(isLocked);
  const row = (l: Line) => {
    const colour = colourOf(l.id);
    const terms = stationCount(l.stops);
    const ids = namedTerms(l.stops);
    const st = ids.map((id) => termStatus(progress, id, today));
    const known = st.filter((s) => s === 'known').length;
    const met = stats.get(l.id)?.met ?? ids.filter((id) => progress.terms[id]).length;
    const due = st.filter((s) => s === 'due').length;
    const locked = isLocked(l);
    const pct = (n: number) => `${terms ? Math.min(100, (n / terms) * 100) : 0}%`;
    return (
      <li key={l.id} className="border-b border-line lg:border-r lg:even:border-r-0">
        <button type="button" onClick={() => onLine(l.id)} className={`group flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition hover:bg-sunken/60 ${locked ? 'opacity-60' : ''}`}>
          {/* A metro roundel in the line's colour. */}
          <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full p-[5px]" style={{ background: metalRing(colour), boxShadow: glow(colour) }} aria-hidden="true">
            <span className="flex h-full w-full items-center justify-center rounded-full bg-surface shadow-[inset_0_1px_2px_rgb(0_0_0/0.18)]">{locked && <Lock className="h-2.5 w-2.5 text-ink-3" />}</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold leading-tight text-ink">{l.name}</span>
            {/* How far along the line: known solid, still learning lighter, the rest a faint track. */}
            <span className="relative mt-2 block h-2 overflow-hidden rounded-full shadow-[inset_0_1px_2px_rgb(0_0_0/0.12)]" aria-hidden="true">
              <span className="absolute inset-0 opacity-15" style={{ background: colour }} />
              <span className="absolute inset-y-0 left-0 rounded-full opacity-50" style={{ width: pct(met), background: metal(colour) }} />
              <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: pct(known), background: metal(colour), boxShadow: glow(colour) }} />
            </span>
            <span className="mt-1.5 block text-xs text-ink-3">
              <span className="num">
                {met} of {terms} met
              </span>
              {due > 0 && <span className="num font-semibold text-amber-ink"> · {due} due</span>}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-ink-3 transition group-hover:translate-x-0.5" />
        </button>
      </li>
    );
  };
  return (
    <ModeFrame progress={progress} today={today} mode="lines" onMode={onMode} title="Term Lines">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <ul className="-mb-px grid lg:grid-cols-2">{open.map(row)}</ul>
      </div>
      {shut.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-extrabold uppercase tracking-[0.12em] text-ink-3">Opens after the phase 3 test</h2>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            <ul className="-mb-px grid lg:grid-cols-2">{shut.map(row)}</ul>
          </div>
        </section>
      )}
      {/* The whole network, with interchanges, for those who want it. Shut by default so the list stays calm. */}
      <details className="group/map overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 hover:bg-sunken/60 [&::-webkit-details-marker]:hidden">
          <LinesIcon className="h-5 w-5 shrink-0 text-ink-3" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold leading-tight text-ink">Network map</span>
            <span className="block text-xs text-ink-3">Every line at once, and where their terms get mixed up</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-ink-3 transition group-open/map:rotate-180" />
        </summary>
        <div className="space-y-4 border-t border-line p-3 sm:p-4">
          <NetworkMap progress={progress} today={today} onLine={onLine} />
          <LinesKey />
        </div>
      </details>
    </ModeFrame>
  );
}

function LineView({
  line,
  progress,
  today,
  onBack,
  onMode,
  onRun,
  onDepot,
}: {
  line: Line;
  progress: Progress;
  today: string;
  onBack: () => void;
  onMode: (m: ModeId) => void;
  onRun: (recipe: Recipe) => void;
  onDepot: (unitId: string) => void;
}) {
  const [sheet, setSheet] = useState<string | null>(null);
  const colour = colourOf(line.id);
  const here = frontier(progress, line.id);
  const preview = useMemo(() => (here >= 0 ? rideRoute(progress, line.id, here) : null), [progress, line.id, here]);
  const due = dueStops(progress, line.id, today);
  const ride = (from: number) => onRun({ build: 'ride', lineId: line.id, from });
  const revisit = () => onRun({ build: 'revisit', lineId: line.id });
  const stopOf = (termId: string) => line.stops.findIndex((s) => 'term' in s && s.term === termId);
  const termAt = (i: number) => {
    const s = line.stops[i];
    return s && 'term' in s && s.term ? termById.get(s.term) : undefined;
  };
  const unitAt = (i: number) => line.units.find((u) => i >= u.from && i <= u.to);
  const terms = stationCount(line.stops);
  const met = namedTerms(line.stops).filter((id) => progress.terms[id]).length;
  const allLocked = line.units.every((u) => !unitOpen(progress, u.id));
  const waiting = met < terms;
  const fresh = preview ? preview.newIds.length + preview.unnamed : 0;
  // Units are titled sections, shut until tapped. The one the line goes on from starts open.
  const [openUnits, setOpenUnits] = useState<Set<string>>(() => new Set(line.units.filter((u) => here >= u.from && here <= u.to).map((u) => u.id)));
  const toggle = (id: string) => {
    const opening = !openUnits.has(id);
    setOpenUnits((o) => {
      const n = new Set(o);
      if (opening) n.add(id);
      else n.delete(id);
      return n;
    });
    if (opening) requestAnimationFrame(() => document.getElementById(`unit-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <ModeFrame
      progress={progress}
      today={today}
      mode="lines"
      onMode={onMode}
      title={
        <span className="flex items-center gap-2">
          <button type="button" onClick={onBack} className="-ml-2 rounded-xl p-1.5 text-ink-3 hover:bg-sunken" aria-label="All lines">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: metal(colour, '160deg'), boxShadow: glow(colour) }} aria-hidden="true" />
          <span className="min-w-0">{line.name}</span>
        </span>
      }
      aside={
        <span className="num shrink-0 font-mono text-sm text-ink-3">
          {met}/{terms}
        </span>
      }
    >
      <div className="sticky top-2 z-20 space-y-2 rounded-2xl border border-line border-t-4 bg-surface/95 p-3 shadow-card backdrop-blur" style={{ borderTopColor: colour }}>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            {preview ? (
              <>
                <p className="font-bold text-ink">{termAt(here) ? `Ride on from ${termAt(here)!.term}` : `Ride on into ${unitAt(here)?.name ?? 'the next stations'}`}</p>
                <p className="text-ink-3">
                  {[fresh ? `${fresh} new` : '', preview.metIds.length ? `${preview.metIds.length} met` : '']
                    .filter(Boolean)
                    .join(', ')}
                  {preview.endsAt && 'depot' in preview.endsAt ? ' · ends at a depot' : ''}
                </p>
              </>
            ) : (
              <p className="text-ink-3">
                {allLocked
                  ? 'This line opens after the phase 3 test.'
                  : here >= 0
                    ? 'Nothing to ride from here yet. Revisit a station instead.'
                    : waiting
                      ? 'The rest of this line opens with its area: meet every core term and pass its drills, or pass the area test in Path.'
                      : 'Every station on this line is met.'}
              </p>
            )}
          </div>
          <Button onClick={() => ride(here)} disabled={!preview} className="!px-4 !py-2.5 text-sm">
            Ride {Math.min(RIDE_STOPS, preview ? preview.to - preview.from + 1 : RIDE_STOPS)} stops
          </Button>
        </div>
        {due.length > 0 && (
          <div className="flex items-center gap-3 border-t border-line pt-2">
            <p className="min-w-0 flex-1 text-sm text-ink-3">
              <span className="font-bold text-amber-ink">{due.length} due</span> on this line, wherever they sit
            </p>
            <Button variant="secondary" onClick={revisit} className="!px-4 !py-2 text-sm">
              Revisit {Math.min(due.length, REVISIT_MAX)}
            </Button>
          </div>
        )}
      </div>

      <LinesKey compact colour={colour} />

      {/* The line as one strip map: a single rail runs down through every unit, each unit a big
          station with its terms as small stations beneath it while it is open. */}
      <ol className="overflow-hidden rounded-2xl border border-line bg-surface py-1 shadow-card">
        {line.units.map((unit, u) => {
          const isOpen = openUnits.has(unit.id);
          const stops = line.stops.slice(unit.from, unit.to + 1);
          const ids = namedTerms(stops);
          const size = stationCount(stops);
          const depot = stops.length === 1 && 'depot' in stops[0];
          const unitMet = ids.filter((id) => progress.terms[id]).length;
          const unitDue = ids.filter((id) => termStatus(progress, id, today) === 'due').length;
          const locked = !unitOpen(progress, unit.id);
          const hasNext = here >= unit.from && here <= unit.to;
          const first = u === 0;
          const last = u === line.units.length - 1;
          const dashed = line.phase === 3 || locked;
          const railStyle = (faded: boolean) => ({
            background: metal(colour, '90deg'),
            boxShadow: faded ? undefined : glow(colour),
            opacity: faded ? 0.35 : 1,
            ...(dashed ? dashMask('180deg') : {}),
          });
          // The rail through a row: from the row above to the row below, cut short at the line's two ends.
          const rail = (top: boolean, bottom: boolean, faded = locked) => (
            <span className={`absolute left-[25px] w-1.5 ${top ? 'top-0' : 'top-1/2'} ${bottom ? 'bottom-0' : 'bottom-1/2'}`} style={railStyle(faded)} aria-hidden="true" />
          );
          const termRows = isOpen && !depot ? runs(stops, unit.from) : [];
          return (
            <li key={unit.id} id={`unit-${unit.id}`} className="scroll-mt-40">
              <button type="button" onClick={() => toggle(unit.id)} aria-expanded={isOpen} className="relative flex w-full items-center gap-3 py-3 pl-[14px] pr-3 text-left hover:bg-sunken/60">
                {rail(!first, !last || termRows.length > 0)}
                <span className="relative flex w-7 shrink-0 justify-center">
                  {depot ? (
                    <span className="h-4 w-4 rotate-45 rounded-[3px] border-[3px]" style={{ borderColor: colour, background: progress.drills?.[unit.id]?.passed ? colour : 'rgb(var(--surface))' }} />
                  ) : (
                    <span className="rounded-full bg-surface p-[3px]">
                      <TermDot status={unitStatus(progress, unit.id, ids, today, size)} colour={colour} size={unit.core ? 20 : 16} metallic />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-semibold leading-tight ${locked ? 'text-ink-3' : 'text-ink'}`}>{unit.name}</span>
                  <span className="block text-xs text-ink-3">
                    {depot
                      ? `Depot · ${KIND_LABEL[(stops[0] as { kind: string }).kind as PracticeKind] ?? 'practice'}`
                      : `${unitMet} of ${size} met${unit.core ? '' : ' · later'}`}
                  </span>
                </span>
                {hasNext && !isOpen && <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-bg">Next</span>}
                {unitDue > 0 && <span className="num rounded-full bg-amber-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-ink">{unitDue} due</span>}
                {locked && <Lock className="h-4 w-4 shrink-0 text-ink-3" />}
                <ChevronDown className={`h-4 w-4 shrink-0 text-ink-3 transition ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && depot && (
                <div className="relative pb-3 pl-[56px] pr-3">
                  {rail(true, !last)}
                  <Button variant="secondary" disabled={!unitOpen(progress, unit.id)} onClick={() => onDepot(unit.id)} className="!px-4 !py-2 text-sm">
                    {unitOpen(progress, unit.id) ? 'Open the depot' : 'Opens with its unit'}
                  </Button>
                </div>
              )}
              {termRows.length > 0 && (
                <ol className="pb-1">
                  {termRows.map(({ stop, i, n }, r) => {
                    const endRail = rail(true, !(last && r === termRows.length - 1));
                    if ('depot' in stop) {
                      const du = unitById.get(stop.depot);
                      const dOpen = unitOpen(progress, stop.depot);
                      const passed = !!progress.drills?.[stop.depot]?.passed;
                      return (
                        <li key={i} className="relative">
                          {endRail}
                          <button type="button" disabled={!dOpen} onClick={() => onDepot(stop.depot)} className="relative flex w-full items-center gap-3 py-2 pl-[14px] pr-3 text-left hover:bg-sunken/60 disabled:opacity-60">
                            <span className="flex w-7 shrink-0 justify-center">
                              <span className="h-3 w-3 rotate-45 rounded-[2px] border-[2.5px]" style={{ borderColor: colour, background: passed ? colour : 'rgb(var(--surface))' }} />
                            </span>
                            <span className="min-w-0 flex-1 text-sm">
                              <span className="font-semibold text-ink">{du?.name ?? stop.depot}</span>
                              <span className="text-ink-3"> · {dOpen ? 'depot' : 'opens with its unit'}</span>
                            </span>
                          </button>
                        </li>
                      );
                    }
                    const t = stop.term ? termById.get(stop.term) : undefined;
                    if (!t) {
                      // Stations not met yet: the app learns their names as the learner reaches them.
                      const next = here >= i && here < i + n;
                      return (
                        <li key={i} className="relative">
                          {endRail}
                          <div className="relative flex w-full items-center gap-3 py-1.5 pl-[14px] pr-3">
                            <span className="flex w-7 shrink-0 justify-center">
                              <TermDot status={unitOpen(progress, unit.id) ? 'unmet' : 'locked'} colour={colour} size={12} metallic />
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm text-ink-3">
                              {n} station{n === 1 ? '' : 's'} not met yet
                            </span>
                            {next && <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-bg">Next</span>}
                          </div>
                        </li>
                      );
                    }
                    const status = termStatus(progress, t.id, today);
                    const faint = status === 'unmet' || status === 'locked';
                    // One mark per other line, however many of its terms meet here.
                    const twinLines = [...new Map(interchangesAt(t.id).map((id) => [areaOf(id)?.id, id])).values()].filter((id) => areaOf(id)?.id !== line.id).slice(0, 2);
                    return (
                      <li key={i} className="relative">
                        {endRail}
                        <button type="button" onClick={() => setSheet(t.id)} className={`relative flex w-full items-center gap-3 py-1.5 pl-[14px] pr-3 text-left hover:bg-sunken/60 ${i === here ? 'bg-sunken' : ''}`}>
                          <span className="flex w-7 shrink-0 justify-center">
                            <TermDot status={status} colour={colour} size={12} metallic />
                          </span>
                          <span className={`min-w-0 flex-1 truncate text-[15px] ${faint ? 'text-ink-3' : 'text-ink'}`}>{t.term}</span>
                          {i === here && <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-bg">Next</span>}
                          {twinLines.length > 0 && (
                            <span className="flex shrink-0 items-center gap-1" title={twinLines.map((id) => `Easily mixed up with ${termById.get(id)?.term ?? 'a term'} on the ${areaOf(id)?.name} line`).join('\n')}>
                              <span className="sr-only">Often mixed up with a term on</span>
                              {twinLines.map((id) => (
                                <span key={id} className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-3">
                                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: areaOf(id)?.colour }} aria-hidden="true" />
                                  <span className="max-w-[6.5rem] truncate">{areaOf(id)?.short}</span>
                                </span>
                              ))}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </li>
          );
        })}
      </ol>

      {sheet && (
        <TermSheet
          termId={sheet}
          progress={progress}
          today={today}
          onClose={() => setSheet(null)}
          onOpenTerm={setSheet}
          actions={
            stopOf(sheet) < 0 || !termById.has(sheet) || !unitOpen(progress, termById.get(sheet)!.unit) ? undefined : canRideFrom(progress, line.id, stopOf(sheet)) ? (
              <Button onClick={() => ride(stopOf(sheet))} className="sm:col-span-2">
                Ride from this station
              </Button>
            ) : here >= 0 ? (
              <p className="text-sm text-ink-3 sm:col-span-2">
                Stations are met in the order Path teaches them, so this one comes {stopOf(sheet) - here} stops after {termAt(here)?.term ?? 'the next station'}, where the line goes on from.
              </p>
            ) : undefined
          }
        />
      )}
    </ModeFrame>
  );
}

const STATES: TermStatus[] = ['locked', 'unmet', 'met', 'due', 'known'];

function KeyItem({ glyph, children }: { glyph: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className="flex w-7 shrink-0 justify-center">{glyph}</span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/** The key to Term Lines: what each station, shape and line means. The line page shows only the station states and the interchange chip. */
function LinesKey({ compact = false, colour = 'rgb(var(--brand))' }: { compact?: boolean; colour?: string }) {
  const states = (
    <ul className={compact ? 'flex flex-wrap gap-x-4 gap-y-1.5' : 'space-y-1.5'}>
      {STATES.map((s) =>
        compact ? (
          <li key={s} className="inline-flex items-center gap-1.5">
            <TermDot status={s} colour={colour} size={12} />
            {STATUS_LABEL[s]}
          </li>
        ) : (
          <KeyItem key={s} glyph={<TermDot status={s} colour={colour} size={11} metallic />}>
            {STATUS_LABEL[s]}
          </KeyItem>
        ),
      )}
    </ul>
  );
  if (compact)
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-xs font-semibold text-ink-3">
        {states}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-ink-3" aria-hidden="true" />
          Line name: often mixed up with a term there
        </span>
      </div>
    );
  const rail = (dashed: boolean) => (
    <svg viewBox="0 0 28 8" className="h-2 w-7" aria-hidden="true">
      <line x1={2} x2={26} y1={4} y2={4} stroke={colour} strokeWidth={4} strokeLinecap="round" opacity={dashed ? 0.3 : 1} />
    </svg>
  );
  return (
    <section className="px-1 text-sm text-ink-2" aria-label="Map key">
      <h2 className="mb-3 text-xs font-extrabold uppercase tracking-[0.12em] text-ink-3">How to read the map</h2>
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
        <div>
          <h3 className="mb-1.5 text-xs font-bold text-ink-3">Station colour: how well you know it</h3>
          {states}
        </div>
        <div>
          <h3 className="mb-1.5 text-xs font-bold text-ink-3">Station shape</h3>
          <ul className="space-y-1.5">
            <KeyItem glyph={<TermDot status="met" colour={colour} size={12} metallic />}>Bigger bead: a core unit, taught first</KeyItem>
            <KeyItem glyph={<TermDot status="met" colour={colour} size={9} metallic />}>Smaller bead: a later unit</KeyItem>
            <KeyItem glyph={<span className="block h-2.5 w-2.5 rotate-45 rounded-[1px] border-[1.5px] bg-surface" style={{ borderColor: colour }} />}>Diamond: a drill, game or desk case</KeyItem>
            <KeyItem glyph={<span className="block h-3.5 w-3.5 rounded-full border-[1.5px] border-ink bg-surface" />}>Dark rim: has terms often mixed up with another line</KeyItem>
          </ul>
        </div>
        <div>
          <h3 className="mb-1.5 text-xs font-bold text-ink-3">Lines</h3>
          <ul className="space-y-1.5">
            <KeyItem glyph={rail(false)}>One area, units in the order Path teaches them</KeyItem>
            <KeyItem
              glyph={
                <svg viewBox="0 0 28 16" className="h-4 w-7" aria-hidden="true">
                  <path d="M6,2 C6,10 22,6 22,14" fill="none" stroke="rgb(var(--ink))" strokeOpacity={0.35} strokeWidth={1.6} strokeLinecap="round" />
                </svg>
              }
            >
              Fine curve: two units whose terms get mixed up a lot
            </KeyItem>
            <KeyItem glyph={rail(true)}>Faded: opens after the phase 3 test</KeyItem>
          </ul>
        </div>
      </div>
    </section>
  );
}
