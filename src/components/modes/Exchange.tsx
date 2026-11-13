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
import { areas, termStatus } from '../../lib/modes/status';
import type { LessonPlan } from '../../lib/lesson';
import type { Rng } from '../../lib/questions';
import { dueTermIds } from '../../lib/scheduler';
import type { Progress } from '../../lib/types';
import { Button } from '../ui';
import { ModeFrame, TermDot, TermSheet } from './shared';

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

  return (
    <ModeFrame progress={progress} today={today} mode="exchange" onMode={onMode} title="Recall Exchange">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="rounded-3xl border border-line bg-surface p-5 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-ink-3">FTS {INDEX_FULL} · your index</p>
              <p className="num font-mono text-4xl font-semibold text-ink">{index.toFixed(1)}</p>
              <p className={`num font-mono text-sm ${change > 0 ? 'text-good-ink' : change < 0 ? 'text-bad-ink' : 'text-ink-3'}`}>
                {prev === undefined ? 'first close today' : `${change === 0 ? 'unchanged' : `${change > 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}`} since ${dayLabel(prev, today)}`}
              </p>
            </div>
            <dl className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-1 whitespace-nowrap text-right text-xs">
              <dt className="text-ink-3">All-time high</dt>
              <dd className="num font-mono font-semibold text-ink">{(rec.top ?? index).toFixed(1)}</dd>
              <dt className="text-ink-3">Listed</dt>
              <dd className="num font-mono font-semibold text-ink">{quotes.length}</dd>
              <dt className="text-ink-3">Avg price</dt>
              <dd className="num font-mono font-semibold text-ink">{k.strength.toFixed(1)}</dd>
              <dt className="text-ink-3">Blue chips</dt>
              <dd className="num font-mono font-semibold text-ink">{blue}</dd>
              <dt className="text-ink-3">Falling</dt>
              <dd className="num font-mono font-semibold text-amber-ink">{quotes.filter((q) => q.falling).length}</dd>
            </dl>
          </div>
          <Spark values={series} />
          <p className="mt-2 text-xs leading-relaxed text-ink-3">
            The index is what your terms are worth together: {INDEX_FULL} is every open term held at full price. Learning lists new terms and lifts it; a review left overdue lets that term slip until you answer it, in any mode.
          </p>
        </div>

        <div className="flex flex-col gap-3">
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
        </div>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-[0.12em] text-violet-ink">Sectors</h2>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <Chip active={!area} onClick={() => onArea(null)} label="All" value={index.toFixed(0)} />
          {sectors.map((s) => (
            <Chip key={s.id} active={area === s.id} colour={areas[s.id]?.colour} onClick={() => onArea(area === s.id ? null : s.id)} label={areas[s.id]?.code ?? s.id} value={marketIndex(progress, today, s.id).toFixed(0)} title={`${s.name}: ${s.met} of ${s.terms} listed, average price ${s.strength}`} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 className="text-xs font-extrabold uppercase tracking-[0.12em] text-violet-ink">Watchlist</h2>
          <span className="text-xs text-ink-3">{since ? `Change since ${dayLabel(since, today)}${fresh ? ` · ${fresh} new` : ''}` : 'Changes show from your next visit'}</span>
        </div>
        {shown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-sm text-ink-2">
            Nothing listed yet. Terms list here once you meet them in any mode.
            <div className="mt-4">
              <Button onClick={() => onRun((rng) => buildListing(progress, today, rng))}>List your first terms</Button>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            {(all ? shown : shown.slice(0, 25)).map((q) => {
              const colour = areas[q.sector]?.colour ?? 'rgb(var(--brand))';
              return (
                <li key={q.termId}>
                  <button type="button" onClick={() => setSheet(q.termId)} className="grid w-full grid-cols-[auto_5.5rem_minmax(0,1fr)_auto_3.5rem] items-center gap-3 px-4 py-2.5 text-left hover:bg-sunken">
                    <TermDot status={termStatus(progress, q.termId, today)} colour={colour} size={11} />
                    <span className="truncate font-mono text-sm font-semibold text-ink">{q.ticker}</span>
                    <span className="truncate text-sm text-ink-2">{termById.get(q.termId)?.term}</span>
                    <span className="num font-mono text-sm font-semibold text-ink">{q.price}</span>
                    <span className={`num text-right font-mono text-xs ${q.fresh ? 'text-sky-ink' : q.change < 0 ? 'text-bad-ink' : q.change > 0 ? 'text-good-ink' : 'text-ink-3'}`}>
                      {q.fresh ? 'NEW' : q.change === 0 ? '·' : `${q.change > 0 ? '+' : '−'}${Math.abs(q.change)}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!all && shown.length > 25 && (
          <button type="button" onClick={() => setAll(true)} className="mt-2 w-full py-2 text-sm font-extrabold text-sky-ink">
            Show all {shown.length}
          </button>
        )}
      </section>

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

function Action({ title, detail, onClick, disabled, primary }: { title: string; detail: string; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-2xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${primary ? 'border-brand bg-brand text-white shadow-press active:translate-y-[2px] active:shadow-none' : 'border-line bg-surface text-ink shadow-press-line hover:bg-sunken active:translate-y-[1px] active:shadow-none'}`}
    >
      <span className="block font-extrabold">{title}</span>
      <span className={`block text-sm ${primary ? 'text-white/80' : 'text-ink-3'}`}>{detail}</span>
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
      className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 font-mono text-sm transition ${active ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink-2 hover:bg-sunken'}`}
    >
      {colour && <span className="h-2.5 w-2.5 rounded-full" style={{ background: colour }} />}
      <span className="font-semibold">{label}</span>
      <span className={active ? 'opacity-80' : 'text-ink-3'}>{value}</span>
    </button>
  );
}

/** The index over the last 30 days. Days without a close are skipped, not drawn as zero. */
function Spark({ values }: { values: (number | null)[] }) {
  const pts = values.map((v, i) => (v === null ? null : ([i, v] as const))).filter((x): x is readonly [number, number] => !!x);
  const W = 300;
  const H = 64;
  if (pts.length < 2)
    return <p className="mt-4 rounded-xl bg-sunken px-3 py-4 text-center text-xs text-ink-3">The chart fills in as you come back on other days.</p>;
  const lo = Math.max(0, Math.min(...pts.map((p) => p[1])) - 2);
  const hi = Math.max(...pts.map((p) => p[1])) + 2;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * H;
  const d = pts.map(([i, v], n) => `${n ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const up = pts[pts.length - 1][1] >= pts[0][1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-16 w-full overflow-visible" preserveAspectRatio="none" role="img" aria-label="Index over the last 30 days">
      <path d={`${d} L${x(pts[pts.length - 1][0])},${H} L${x(pts[0][0])},${H} Z`} className={up ? 'fill-good/10' : 'fill-bad/10'} />
      <path d={d} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" className={up ? 'stroke-good' : 'stroke-bad'} />
    </svg>
  );
}

/** "yesterday", or a short date for an older visit. */
function dayLabel(day: string, today: string): string {
  if (day === addDays(today, -1)) return 'yesterday';
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
