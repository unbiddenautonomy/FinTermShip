/**
 * Recall Exchange: every term you have met is listed under a ticker and priced at its
 * Strength. Prices fall while a review is overdue; defending a stock is answering it.
 * The index is the shared Strength number, so it moves whichever mode you study in.
 */
import { useEffect, useMemo, useState } from 'react';
import { termById } from '../../lib/content';
import { addDays } from '../../lib/dates';
import { baseline, INDEX_FULL, marketIndex, snapshotCurrent, snapshotIndex, watchlist } from '../../lib/modes/exchange';
import { areaKpis, kpis, modeRecord, type ModeId } from '../../lib/modes/knowledge';
import { buildDefend, buildListing, buildRally } from '../../lib/modes/plans';
import { areas } from '../../lib/modes/status';
import type { LessonPlan } from '../../lib/lesson';
import type { Rng } from '../../lib/questions';
import { dueTermIds } from '../../lib/scheduler';
import type { Progress } from '../../lib/types';
import { Button } from '../ui';
import { ModeFrame, TermSheet } from './shared';

interface Props {
  progress: Progress;
  today: string;
  area: string | null;
  onArea: (a: string | null) => void;
  onProgress: (p: Progress) => void;
  onMode: (m: ModeId) => void;
  onRun: (make: (rng: Rng) => LessonPlan | null) => void;
}

const DEFEND_MAX = 8;

export function Exchange({ progress, today, area, onArea, onProgress, onMode, onRun }: Props) {
  const [sheet, setSheet] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const rec = modeRecord(progress, 'exchange');
  const k = kpis(progress, today);

  const index = marketIndex(progress, today);
  // Save today's reading once the screen opens, and again if prices move while it is open.
  useEffect(() => {
    if (!snapshotCurrent(progress, today)) onProgress(snapshotIndex(progress, today));
  }, [progress, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const quotes = useMemo(() => watchlist(progress, today), [progress, today]);
  const shown = area ? quotes.filter((q) => q.sector === area) : quotes;
  const sectors = areaKpis(progress, today).filter((s) => s.met > 0);
  const due = new Set(dueTermIds(progress, today));
  const fallers = shown.filter((q) => q.falling).map((q) => q.termId);
  const blue = quotes.filter((q) => q.blueChip).length;
  const closes = rec.closes ?? {};
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
  const series = days.map((d) => closes[d] ?? null);
  const prev = Object.keys(closes)
    .filter((d) => d < today)
    .sort()
    .pop();
  const change = prev !== undefined ? index - closes[prev] : 0;
  const since = baseline(progress, today)?.day;
  const fresh = quotes.filter((q) => q.fresh).length;

  const defend = (ids: string[]) => onRun((rng) => buildDefend(progress, ids.slice(0, DEFEND_MAX), today, rng));

  // The tape: the biggest movers since the last visit, or the lowest prices on a first visit.
  const tape = [...quotes].sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || a.price - b.price).slice(0, 14);

  return (
    <ModeFrame progress={progress} today={today} mode="exchange" onMode={onMode} title="Recall Exchange">
      {/* The Exchange keeps its own trading-screen look in every theme; the strip above stays shared. */}
      <div className="-mx-4 overflow-hidden bg-[#0C1311] text-[#E6ECE8] sm:mx-0 sm:rounded-3xl">
        {tape.length > 0 && (
          <div className="overflow-hidden border-b border-[#22302A] bg-[#070B0A] py-2" aria-hidden="true">
            <div className="flex w-max animate-tape gap-6 whitespace-nowrap px-4 font-mono text-[13px] font-semibold motion-reduce:animate-none">
              {[...tape, ...tape].map((q, i) => (
                <span key={i} className={q.change < 0 || (q.change === 0 && q.falling) ? 'text-[#FF7A6E]' : q.change > 0 ? 'text-[#4FD18B]' : 'text-[#9AA8A0]'}>
                  {q.ticker} {q.price}
                  {q.change !== 0 && ` ${q.change > 0 ? '▲' : '▼'}${Math.abs(q.change)}`}
                </span>
              ))}
            </div>
          </div>
        )}

        <section className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8FA096]">
              FTS {INDEX_FULL} · {quotes.length} listed
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
              <p className="num font-mono text-5xl font-semibold tracking-tight">{index.toFixed(1)}</p>
              <p className={`num font-mono text-sm font-semibold ${change > 0 ? 'text-[#4FD18B]' : change < 0 ? 'text-[#FF7A6E]' : 'text-[#8FA096]'}`}>
                {prev === undefined ? 'first close today' : `${change === 0 ? 'unchanged' : `${change > 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}`} since ${dayLabel(prev, today)}`}
              </p>
            </div>
            <Spark values={series} />
            <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-[#22302A] pt-3 font-mono">
              <Stat label="High" value={(rec.top ?? index).toFixed(1)} />
              <Stat label="Avg price" value={k.strength.toFixed(1)} />
              <Stat label="Blue chips" value={String(blue)} />
              <Stat label="Falling" value={String(quotes.filter((q) => q.falling).length)} tone="text-[#F2B456]" />
            </dl>
          </div>

          <div className="flex flex-col gap-2.5">
            <Action
              title="Defend the fallers"
              detail={fallers.length ? `${Math.min(DEFEND_MAX, fallers.length)} of ${fallers.length} falling${area ? ' in this sector' : ''}` : 'Nothing falling right now'}
              disabled={!fallers.length}
              onClick={() => defend(fallers)}
              primary
            />
            {area && (
              <Action
                title="Rally this sector"
                detail="Up to 5 due terms, back to back"
                disabled={!quotes.some((q) => q.sector === area && due.has(q.termId))}
                onClick={() => onRun((rng) => buildRally(progress, area, today, rng))}
              />
            )}
            <Action title="New listings" detail="Learn the next 3 terms on your track" onClick={() => onRun((rng) => buildListing(progress, today, rng))} />
            <p className="text-xs leading-relaxed text-[#8FA096]">
              The index is what your terms are worth together: {INDEX_FULL} is every open term at full price. Learning lists new terms and lifts it. A review left overdue lets that term slip until you answer it, in any mode.
            </p>
          </div>
        </section>

        <div className="flex gap-2 overflow-x-auto border-y border-[#22302A] px-4 py-2.5">
          <Chip active={!area} onClick={() => onArea(null)} label="ALL" value={index.toFixed(0)} />
          {sectors.map((s) => (
            <Chip key={s.id} active={area === s.id} colour={areas[s.id]?.colour} onClick={() => onArea(area === s.id ? null : s.id)} label={areas[s.id]?.code ?? s.id} value={marketIndex(progress, today, s.id).toFixed(0)} title={`${s.name}: ${s.met} of ${s.terms} listed, average price ${s.strength}`} />
          ))}
        </div>

        {shown.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-[#A9B6AE]">
            Nothing listed yet. Terms list here once you meet them in any mode.
            <div className="mt-4">
              <button type="button" onClick={() => onRun((rng) => buildListing(progress, today, rng))} className="rounded-lg bg-[#F2B456] px-4 py-2.5 font-extrabold text-[#1B1408]">
                List your first terms
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_3rem_4rem] gap-3 px-4 pb-1.5 pt-3 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7F8F86]">
              <span>Term</span>
              <span className="text-right">Price</span>
              <span className="text-right" title={since ? `Since ${dayLabel(since, today)}` : undefined}>
                Chg
              </span>
            </div>
            <ul className="divide-y divide-[#1C2723]">
              {(all ? shown : shown.slice(0, 25)).map((q) => {
                const colour = areas[q.sector]?.colour ?? '#888';
                return (
                  <li key={q.termId}>
                    <button type="button" onClick={() => setSheet(q.termId)} className="grid w-full grid-cols-[minmax(0,1fr)_3rem_4rem] items-center gap-3 px-4 py-2.5 text-left hover:bg-[#15201C]">
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 font-mono text-[15px] font-semibold tracking-wide">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colour }} />
                          {q.ticker}
                          {q.falling && <span className="rounded bg-[#3A2A10] px-1 text-[10px] text-[#F2B456]">DUE</span>}
                        </span>
                        <span className="block truncate pl-4 text-[13px] text-[#93A39A]">{termById.get(q.termId)?.term}</span>
                      </span>
                      <span className="num text-right font-mono text-[15px] font-semibold">{q.price}</span>
                      <span
                        className={`num rounded-md py-1 text-right font-mono text-[13px] font-semibold ${q.fresh ? 'bg-[#1E3A5A] pr-2 text-[#9CC7F0]' : q.change < 0 ? 'bg-[#C8443C] pr-2 text-white' : q.change > 0 ? 'bg-[#1F9D61] pr-2 text-white' : 'pr-2 text-[#5F6E66]'}`}
                      >
                        {q.fresh ? 'NEW' : q.change === 0 ? '0' : `${q.change > 0 ? '+' : '−'}${Math.abs(q.change)}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="px-4 py-3 text-xs text-[#7F8F86]">
              {since ? `Changes since your visit ${dayLabel(since, today)}${fresh ? `, with ${fresh} new listing${fresh === 1 ? '' : 's'}` : ''}. Due terms first, then the biggest falls.` : 'Changes show from your next visit on another day.'}
            </p>
            {!all && shown.length > 25 && (
              <button type="button" onClick={() => setAll(true)} className="w-full border-t border-[#22302A] py-3 font-mono text-sm font-semibold text-[#F2B456]">
                Show all {shown.length}
              </button>
            )}
          </>
        )}
      </div>

      {sheet && (
        <TermSheet
          termId={sheet}
          progress={progress}
          today={today}
          onClose={() => setSheet(null)}
          onOpenTerm={setSheet}
          actions={
            progress.terms[sheet] && progress.terms[sheet].step > 0 ? (
              <Button onClick={() => defend([sheet])} className="sm:col-span-2">
                {due.has(sheet) ? 'Defend it now' : 'Practise it'}
              </Button>
            ) : undefined
          }
        />
      )}
    </ModeFrame>
  );
}

function Stat({ label, value, tone = 'text-[#E6ECE8]' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10px] uppercase tracking-[0.12em] text-[#7F8F86]">{label}</dt>
      <dd className={`num text-base font-semibold ${tone}`}>{value}</dd>
    </div>
  );
}

function Action({ title, detail, onClick, disabled, primary }: { title: string; detail: string; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-3 text-left transition active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-40 ${primary ? 'bg-[#F2B456] text-[#1B1408] hover:brightness-105' : 'border border-[#2E3D36] text-[#E6ECE8] hover:bg-[#15201C]'}`}
    >
      <span className="block font-extrabold">{title}</span>
      <span className={`block font-mono text-xs ${primary ? 'text-[#4A3612]' : 'text-[#8FA096]'}`}>{detail}</span>
    </button>
  );
}

function Chip({ label, value, active, colour, onClick, title }: { label: string; value: string; active: boolean; colour?: string; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`flex shrink-0 items-center gap-2 rounded-md border px-2.5 py-1 font-mono text-[13px] transition ${active ? 'border-[#E6ECE8] bg-[#E6ECE8] text-[#0C1311]' : 'border-[#2E3D36] text-[#B7C3BC] hover:bg-[#15201C]'}`}
    >
      {colour && <span className="h-2 w-2 rounded-full" style={{ background: colour }} />}
      <span className="font-semibold">{label}</span>
      <span className={active ? 'opacity-70' : 'text-[#7F8F86]'}>{value}</span>
    </button>
  );
}

/** The index over the last 30 days. Days without a close are skipped, not drawn as zero. */
function Spark({ values }: { values: (number | null)[] }) {
  const pts = values.map((v, i) => (v === null ? null : ([i, v] as const))).filter((x): x is readonly [number, number] => !!x);
  const W = 300;
  const H = 64;
  if (pts.length < 2)
    return <p className="mt-4 rounded-lg border border-dashed border-[#2E3D36] px-3 py-4 text-center font-mono text-xs text-[#7F8F86]">The chart fills in as you come back on other days.</p>;
  const lo = Math.max(0, Math.min(...pts.map((p) => p[1])) - 2);
  const hi = Math.max(...pts.map((p) => p[1])) + 2;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * H;
  const d = pts.map(([i, v], n) => `${n ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const up = pts[pts.length - 1][1] >= pts[0][1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-16 w-full overflow-visible" preserveAspectRatio="none" role="img" aria-label="Index over the last 30 days">
      <path d={`${d} L${x(pts[pts.length - 1][0])},${H} L${x(pts[0][0])},${H} Z`} fill={up ? 'rgb(79 209 139 / 0.12)' : 'rgb(255 122 110 / 0.12)'} />
      <path d={d} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" stroke={up ? '#4FD18B' : '#FF7A6E'} />
    </svg>
  );
}

/** "yesterday", or a short date for an older visit. */
function dayLabel(day: string, today: string): string {
  if (day === addDays(today, -1)) return 'yesterday';
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
