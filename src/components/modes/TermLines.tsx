/**
 * Term Lines: the syllabus drawn as a metro. One line per area, one station per term in the
 * order Path teaches them, a depot wherever a unit is a drill, game or case, and an
 * interchange wherever two terms on different lines are easily mixed up. The map is generated
 * from the syllabus, so no term is ever left off it.
 */
import { Fragment, useMemo, useState } from 'react';
import { unitOpen } from '../../lib/choose';
import { termById, unitById } from '../../lib/content';
import { KIND_LABEL } from '../../lib/practice';
import type { LessonPlan } from '../../lib/lesson';
import { areaKpis, type ModeId } from '../../lib/modes/knowledge';
import { buildRide, lines, lineById, nextStop, RIDE_STOPS, type Line } from '../../lib/modes/plans';
import { areaOf, areas, termStatus, type TermStatus } from '../../lib/modes/status';
import { interchangesAt } from '../../lib/modes/transfer';
import type { Rng } from '../../lib/questions';
import type { PracticeKind, Progress } from '../../lib/types';
import { ArrowLeft, Lock } from '../icons';
import { Button } from '../ui';
import { DotKey, ModeFrame, TermDot, TermSheet } from './shared';

interface Props {
  progress: Progress;
  today: string;
  area: string | null;
  onArea: (a: string | null) => void;
  onMode: (m: ModeId) => void;
  onRun: (make: (rng: Rng) => LessonPlan | null) => void;
  onDepot: (unitId: string) => void;
}

const colourOf = (lineId: string) => areas[lineId]?.colour ?? 'rgb(var(--brand))';

/** A unit as one station on the network map: its weakest state wins, so due work shows. */
function unitStatus(p: Progress, unitId: string, termIds: string[], today: string): TermStatus {
  if (!unitOpen(p, unitId)) return 'locked';
  const st = termIds.map((id) => termStatus(p, id, today));
  if (st.includes('due')) return 'due';
  if (st.length && st.every((s) => s === 'known')) return 'known';
  if (st.some((s) => s !== 'unmet')) return 'met';
  return 'unmet';
}

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
  onRun: (make: (rng: Rng) => LessonPlan | null) => void;
  onDepot: (unitId: string) => void;
}) {
  const [sheet, setSheet] = useState<string | null>(null);
  const colour = colourOf(line.id);
  const here = nextStop(progress, line.id, today);
  const unitAt = useMemo(() => new Map(line.units.map((u) => [u.from, u])), [line]);
  const preview = useMemo(() => buildRide(progress, line.id, here, today, () => 0.5), [progress, line.id, here, today]);
  const ride = (from: number) => onRun((rng) => buildRide(progress, line.id, from, today, rng)?.plan ?? null);
  const stopOf = (termId: string) => line.stops.findIndex((s) => 'term' in s && s.term === termId);
  const terms = line.stops.filter((s) => 'term' in s).length;
  const met = line.stops.filter((s) => 'term' in s && progress.terms[s.term]).length;

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
      <div className="sticky top-2 z-20 flex items-center gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur">
        <div className="min-w-0 flex-1 text-sm">
          {preview ? (
            <>
              <p className="font-bold text-ink">
                Ride from {termById.get('term' in line.stops[here] ? (line.stops[here] as { term: string }).term : '')?.term ?? 'here'}
              </p>
              <p className="text-ink-3">
                {preview.plan.newIds.length ? `${preview.plan.newIds.length} new` : ''}
                {preview.plan.newIds.length && preview.to - preview.from + 1 - preview.plan.newIds.length > 0 ? ', ' : ''}
                {preview.to - preview.from + 1 - preview.plan.newIds.length > 0 ? `${preview.to - preview.from + 1 - preview.plan.newIds.length} to revisit` : ''}
                {preview.endsAt && 'depot' in preview.endsAt ? ' · ends at a depot' : ''}
              </p>
            </>
          ) : (
            <p className="text-ink-3">{line.units.every((u) => !unitOpen(progress, u.id)) ? 'This line opens after the phase 3 test.' : 'No new stops left today. Come back tomorrow, or revisit a station.'}</p>
          )}
        </div>
        <Button onClick={() => ride(here)} disabled={!preview} className="!px-4 !py-2.5 text-sm">
          Ride {Math.min(RIDE_STOPS, preview ? preview.to - preview.from + 1 : RIDE_STOPS)} stops
        </Button>
      </div>

      <ol className="relative">
        {line.stops.map((stop, i) => {
          const unit = unitAt.get(i);
          const head = unit && (
            <li className="pb-2 pl-10 pt-5 first:pt-0">
              <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-violet-ink">
                {unit.name}
                {!unit.core && <span className="ml-2 font-bold normal-case tracking-normal text-ink-3">later</span>}
                {!unitOpen(progress, unit.id) && <Lock className="ml-2 inline h-3.5 w-3.5 text-ink-3" />}
              </p>
            </li>
          );
          const rail = (
            <span className="absolute bottom-0 left-[13px] top-0 w-1" style={{ background: line.phase === 3 ? `repeating-linear-gradient(180deg, ${colour} 0 8px, transparent 8px 12px)` : colour }} aria-hidden="true" />
          );
          if ('depot' in stop) {
            const u = unitById.get(stop.depot);
            const open = unitOpen(progress, stop.depot);
            const passed = !!progress.drills?.[stop.depot]?.passed;
            return (
              <Fragment key={i}>
                {head}
                <li className="relative">
                  {rail}
                  <button type="button" disabled={!open} onClick={() => onDepot(stop.depot)} className="relative flex w-full items-center gap-3 py-2 text-left disabled:opacity-60">
                    <span className="ml-[5px] flex h-5 w-5 shrink-0 rotate-45 items-center justify-center border-[3px]" style={{ borderColor: colour, background: passed ? colour : 'rgb(var(--surface))' }} />
                    <span className="min-w-0 flex-1 rounded-xl border border-dashed px-3 py-2" style={{ borderColor: colour }}>
                      <span className="block text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-3">Depot · {KIND_LABEL[stop.kind as PracticeKind] ?? stop.kind}</span>
                      <span className="block font-bold text-ink">{u?.name ?? stop.depot}</span>
                    </span>
                  </button>
                </li>
              </Fragment>
            );
          }
          const t = termById.get(stop.term);
          if (!t) return null;
          const status = termStatus(progress, t.id, today);
          // One chip per other line, however many of its terms meet here.
          const twinLines = [...new Map(interchangesAt(t.id).map((id) => [areaOf(id)?.id, id])).values()].filter((id) => areaOf(id)?.id !== line.id).slice(0, 3);
          return (
            <Fragment key={i}>
              {head}
              <li className="relative">
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
            </Fragment>
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
            stopOf(sheet) >= 0 && unitOpen(progress, termById.get(sheet)!.unit) ? (
              <Button onClick={() => ride(stopOf(sheet))} className="sm:col-span-2">
                Ride from this station
              </Button>
            ) : undefined
          }
        />
      )}
    </ModeFrame>
  );
}
