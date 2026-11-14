/**
 * Term Lines: the syllabus drawn as a metro. One line per area, one station per term in the
 * order Path teaches them, a depot wherever a unit is a drill, game or case, and an
 * interchange wherever two terms on different lines are easily mixed up. The map is generated
 * from the syllabus, so no term is ever left off it.
 */
import { useMemo, useState } from 'react';
import { unitOpen } from '../../lib/choose';
import { termById, unitById } from '../../lib/content';
import { KIND_LABEL } from '../../lib/practice';
import { areaKpis, type ModeId } from '../../lib/modes/knowledge';
import { canRideFrom, dueStops, frontier, lines, lineById, REVISIT_MAX, rideRoute, RIDE_STOPS, type Line } from '../../lib/modes/plans';
import { areaOf, areas, termStatus, unitStatus } from '../../lib/modes/status';
import { interchangesAt } from '../../lib/modes/transfer';
import type { Recipe } from '../../lib/session';
import type { PracticeKind, Progress } from '../../lib/types';
import { ArrowLeft, ChevronDown, Lock } from '../icons';
import { Button } from '../ui';
import { NetworkMap } from './NetworkMap';
import { DotKey, ModeFrame, TermDot, TermSheet } from './shared';

interface Props {
  progress: Progress;
  today: string;
  area: string | null;
  onArea: (a: string | null) => void;
  onMode: (m: ModeId) => void;
  onRun: (recipe: Recipe) => void;
  onDepot: (unitId: string) => void;
}

const colourOf = (lineId: string) => areas[lineId]?.colour ?? 'rgb(var(--brand))';

export function TermLines({ progress, today, area, onArea, onMode, onRun, onDepot }: Props) {
  const line = area ? lineById.get(area) : undefined;
  return line ? (
    <LineView line={line} progress={progress} today={today} onBack={() => onArea(null)} onMode={onMode} onRun={onRun} onDepot={onDepot} />
  ) : (
    <Network progress={progress} today={today} onLine={onArea} onMode={onMode} />
  );
}

function Network({ progress, today, onLine, onMode }: { progress: Progress; today: string; onLine: (id: string) => void; onMode: (m: ModeId) => void }) {
  const stats = new Map(areaKpis(progress, today).map((a) => [a.id, a]));
  return (
    <ModeFrame progress={progress} today={today} mode="lines" onMode={onMode} title="Term Lines">
      <NetworkMap progress={progress} today={today} onLine={onLine} />
      <DotKey />
      <ul className="space-y-2">
        {lines.map((l) => {
          const colour = colourOf(l.id);
          const terms = l.stops.filter((s) => 'term' in s).length;
          const s = stats.get(l.id);
          const locked = l.units.every((u) => !unitOpen(progress, u.id));
          const due = l.stops.filter((st) => 'term' in st && termStatus(progress, st.term, today) === 'due').length;
          return (
            <li key={l.id}>
              <button type="button" onClick={() => onLine(l.id)} className="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-left shadow-card transition hover:bg-sunken">
                <div className="flex items-center gap-2">
                  <span className="rounded px-1.5 py-0.5 font-mono text-xs font-semibold text-white" style={{ background: colour }}>
                    {areas[l.id]?.code}
                  </span>
                  <span className="min-w-0 flex-1 font-bold leading-tight text-ink">{l.name}</span>
                  {locked && <Lock className="h-4 w-4 text-ink-3" />}
                  {due > 0 && <span className="num rounded-full bg-amber-soft px-2 py-0.5 font-mono text-xs font-semibold text-amber-ink">{due} due</span>}
                  <span className="num font-mono text-xs text-ink-3">
                    {s?.met ?? 0}/{terms}
                  </span>
                </div>
                {/* The strip: one station per unit, spaced by its size; a square for a depot. */}
                <div className="relative mt-3 flex h-4 items-center">
                  <span className={`absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full ${l.phase === 3 && locked ? 'opacity-40' : ''}`} style={{ background: l.phase === 3 && locked ? `repeating-linear-gradient(90deg, ${colour} 0 6px, transparent 6px 10px)` : colour }} />
                  <span className="relative flex w-full items-center justify-between">
                    {l.units.map((u) => {
                      const depot = l.stops[u.from] && 'depot' in l.stops[u.from];
                      const ids = l.stops.slice(u.from, u.to + 1).flatMap((st) => ('term' in st ? [st.term] : []));
                      const st = unitStatus(progress, u.id, ids, today);
                      return depot ? (
                        <span key={u.id} title={u.name} className={`h-3 w-3 rotate-45 border-2 ${st === 'locked' ? 'border-dashed opacity-60' : ''}`} style={{ borderColor: colour, background: st === 'known' || st === 'met' ? colour : 'rgb(var(--surface))' }} />
                      ) : (
                        <span key={u.id} title={u.name}>
                          <TermDot status={st} colour={colour} size={u.core ? 14 : 11} />
                        </span>
                      );
                    })}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="px-1 text-xs leading-relaxed text-ink-3">
        Large stations are the core units Path teaches first. Diamonds are depots: a drill, game or desk case. Dashed lines open after the phase 3 test.
      </p>
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
  const termAt = (i: number) => termById.get((line.stops[i] as { term: string }).term);
  const terms = line.stops.filter((s) => 'term' in s).length;
  const met = line.stops.filter((s) => 'term' in s && progress.terms[s.term]).length;
  const allLocked = line.units.every((u) => !unitOpen(progress, u.id));
  const waiting = line.stops.some((s) => 'term' in s && !progress.terms[s.term]);
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
          <span className="rounded px-1.5 py-0.5 font-mono text-base font-semibold text-white" style={{ background: colour }}>
            {areas[line.id]?.code}
          </span>
          <span className="min-w-0">{line.name}</span>
        </span>
      }
      aside={
        <span className="num shrink-0 font-mono text-sm text-ink-3">
          {met}/{terms}
        </span>
      }
    >
      <div className="sticky top-2 z-20 space-y-2 rounded-2xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            {preview ? (
              <>
                <p className="font-bold text-ink">Ride on from {termAt(here)?.term ?? 'here'}</p>
                <p className="text-ink-3">
                  {[
                    preview.newIds.length ? `${preview.newIds.length} new` : '',
                    preview.to - preview.from + 1 - preview.newIds.length > 0 ? `${preview.to - preview.from + 1 - preview.newIds.length} met` : '',
                  ]
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

      <div className="space-y-2">
        {line.units.map((unit) => {
          const isOpen = openUnits.has(unit.id);
          const stops = line.stops.slice(unit.from, unit.to + 1);
          const ids = stops.flatMap((st) => ('term' in st ? [st.term] : []));
          const depot = stops.length === 1 && 'depot' in stops[0];
          const unitMet = ids.filter((id) => progress.terms[id]).length;
          const unitDue = ids.filter((id) => termStatus(progress, id, today) === 'due').length;
          const locked = !unitOpen(progress, unit.id);
          const hasNext = here >= unit.from && here <= unit.to;
          return (
            <section key={unit.id} id={`unit-${unit.id}`} className="scroll-mt-40 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              <button type="button" onClick={() => toggle(unit.id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-sunken/60">
                <span className="flex w-[30px] shrink-0 justify-center">
                  {depot ? (
                    <span className="h-3.5 w-3.5 rotate-45 border-[3px]" style={{ borderColor: colour, background: progress.drills?.[unit.id]?.passed ? colour : 'rgb(var(--surface))' }} />
                  ) : (
                    <TermDot status={unitStatus(progress, unit.id, ids, today)} colour={colour} size={unit.core ? 16 : 13} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold leading-tight text-ink">{unit.name}</span>
                  <span className="block text-xs text-ink-3">
                    {depot
                      ? `Depot · ${KIND_LABEL[(stops[0] as { kind: string }).kind as PracticeKind] ?? 'practice'}`
                      : `${unitMet}/${ids.length} met${unit.core ? '' : ' · later'}`}
                  </span>
                </span>
                {hasNext && <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-bg">Next</span>}
                {unitDue > 0 && <span className="num rounded-full bg-amber-soft px-2 py-0.5 font-mono text-xs font-semibold text-amber-ink">{unitDue} due</span>}
                {locked && <Lock className="h-4 w-4 shrink-0 text-ink-3" />}
                <ChevronDown className={`h-4 w-4 shrink-0 text-ink-3 transition ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <ol className="relative max-h-[60vh] overflow-y-auto border-t border-line px-1 py-1">
                  {stops.map((stop, k) => {
                    const i = unit.from + k;
                    const rail = (
                      <span className="absolute bottom-0 left-[13px] top-0 w-1" style={{ background: line.phase === 3 ? `repeating-linear-gradient(180deg, ${colour} 0 8px, transparent 8px 12px)` : colour }} aria-hidden="true" />
                    );
                    if ('depot' in stop) {
                      const u = unitById.get(stop.depot);
                      const open = unitOpen(progress, stop.depot);
                      const passed = !!progress.drills?.[stop.depot]?.passed;
                      return (
                        <li key={i} className="relative">
                          {rail}
                          <button type="button" disabled={!open} onClick={() => onDepot(stop.depot)} className="relative flex w-full items-center gap-3 py-2 text-left disabled:opacity-60">
                            <span className="ml-[5px] flex h-5 w-5 shrink-0 rotate-45 items-center justify-center border-[3px]" style={{ borderColor: colour, background: passed ? colour : 'rgb(var(--surface))' }} />
                            <span className="min-w-0 flex-1 rounded-xl border border-dashed px-3 py-2" style={{ borderColor: colour }}>
                              <span className="block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-3">{open ? 'Open the depot' : 'Opens with its unit'}</span>
                              <span className="block font-bold text-ink">{u?.name ?? stop.depot}</span>
                            </span>
                          </button>
                        </li>
                      );
                    }
                    const t = termById.get(stop.term);
                    if (!t) return null;
                    const status = termStatus(progress, t.id, today);
                    // One chip per other line, however many of its terms meet here.
                    const twinLines = [...new Map(interchangesAt(t.id).map((id) => [areaOf(id)?.id, id])).values()].filter((id) => areaOf(id)?.id !== line.id).slice(0, 3);
                    return (
                      <li key={i} className="relative">
                        {rail}
                        <button type="button" onClick={() => setSheet(t.id)} className={`relative flex w-full items-center gap-3 rounded-xl py-1.5 text-left hover:bg-sunken/60 ${i === here ? 'bg-sunken' : ''}`}>
                          <span className="flex w-[30px] shrink-0 justify-center">
                            <TermDot status={status} colour={colour} size={status === 'unmet' || status === 'locked' ? 14 : 16} />
                          </span>
                          <span className={`min-w-0 flex-1 truncate ${status === 'unmet' || status === 'locked' ? 'text-ink-3' : 'font-bold text-ink'}`}>{t.term}</span>
                          {i === here && <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-bg">Next</span>}
                          <span className="flex shrink-0 gap-1 pr-2">
                            {twinLines.map((id) => {
                              const a = areaOf(id);
                              return (
                                <span key={id} title={`Interchange with the ${a?.name} line`} className="rounded px-1 font-mono text-[10px] font-semibold text-white" style={{ background: a?.colour }}>
                                  {a?.code}
                                </span>
                              );
                            })}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          );
        })}
      </div>

      {sheet && (
        <TermSheet
          termId={sheet}
          progress={progress}
          today={today}
          onClose={() => setSheet(null)}
          onOpenTerm={setSheet}
          actions={
            stopOf(sheet) < 0 || !unitOpen(progress, termById.get(sheet)!.unit) ? undefined : canRideFrom(progress, line.id, stopOf(sheet)) ? (
              <Button onClick={() => ride(stopOf(sheet))} className="sm:col-span-2">
                Ride from this station
              </Button>
            ) : here >= 0 ? (
              <p className="text-sm text-ink-3 sm:col-span-2">
                Stations are met in the order Path teaches them, so this one comes {stopOf(sheet) - here} stops after {termAt(here)?.term}, where the line goes on from.
              </p>
            ) : undefined
          }
        />
      )}
    </ModeFrame>
  );
}
