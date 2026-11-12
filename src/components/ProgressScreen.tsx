import { useState } from 'react';
import { categories } from '../lib/content';
import { clock } from '../lib/drills';
import { KIND_LABEL } from '../lib/practice';
import { currentStreak } from '../lib/scheduler';
import { accuracy, areaStats, practiceBests, totals, weeklyStats, type WeekStat } from '../lib/stats';
import type { Progress } from '../lib/types';
import { weakSpots } from '../lib/weak';
import { Check } from './icons';
import { Card, SectionTitle } from './ui';

const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)}%`);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDay = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

/** How the learner is doing: totals, terms over time, accuracy by area and best scores. */
export function ProgressScreen({ progress, today, onWeak }: { progress: Progress; today: string; onWeak: () => void }) {
  const t = totals(progress);
  const weeks = weeklyStats(progress, today);
  const areas = areaStats(progress);
  const bests = practiceBests(progress);
  const weak = weakSpots(progress).length;
  const mocks = Object.entries(progress.mocks ?? {});
  const tests = Object.entries(progress.tests ?? {});
  const areaName = new Map(categories.map((c) => [c.id, c.name]));
  const [allBests, setAllBests] = useState(false);

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 pb-32 pt-5 lg:max-w-5xl lg:px-8 lg:pb-12 lg:pt-8">
      <h1 className="text-2xl font-display font-semibold tracking-tight text-ink">Progress</h1>

      <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
        <Tile label="Terms met" value={t.met} />
        <Tile label="Known" value={t.known} />
        <Tile label="Mastered" value={t.mastered} />
        <Tile label="Right overall" value={pct(accuracy(t.right, t.wrong))} />
        <Tile label="Day streak" value={currentStreak(progress, today)} />
        <Tile label="Days practised" value={t.daysPractised} />
      </div>

      <div className="space-y-6 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
        <section>
          <SectionTitle aside={`${weeks[weeks.length - 1].total} met in all`}>New terms, last 12 weeks</SectionTitle>
          <Card>
            <WeekBars weeks={weeks} />
          </Card>
        </section>

        <section>
          <SectionTitle aside={weak ? `${weak} weak` : undefined}>Best scores</SectionTitle>
          <Card className="space-y-4">
            {bests.length === 0 && mocks.length === 0 && tests.length === 0 && <p className="text-sm text-ink-3">Play a drill, game or desk case and your best results show up here.</p>}
            {bests.length > 0 && (
              <ul className="divide-y divide-line">
                {(allBests ? bests : bests.slice(0, 6)).map((b) => (
                  <li key={b.unitId} className="flex items-center gap-3 py-2 text-sm">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${b.passed ? 'bg-good-soft text-good-ink' : 'bg-sunken text-ink-3'}`} aria-label={b.passed ? 'Passed' : 'Not passed yet'}>
                      {b.passed ? <Check className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-ink">{b.name}</span>
                      <span className="block text-xs text-ink-3">
                        {KIND_LABEL[b.kind]} · {b.rounds} {b.rounds === 1 ? 'round' : 'rounds'}
                      </span>
                    </span>
                    <span className="num shrink-0 text-right font-bold text-ink-2">
                      {b.kind === 'drill' ? (b.bestMs ? clock(b.bestMs) : `${b.bestRight} right`) : `${b.bestRight} ${b.kind === 'case' ? 'best calls' : 'checks'}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {bests.length > 6 && (
              <button type="button" onClick={() => setAllBests(!allBests)} className="block text-sm font-extrabold text-brand-ink">
                {allBests ? 'Show fewer' : `Show all ${bests.length}`}
              </button>
            )}
            {mocks.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-extrabold uppercase tracking-[0.12em] text-violet-ink">Mock rounds</p>
                <ul className="space-y-1 text-sm">
                  {mocks.map(([round, m]) => (
                    <li key={round} className="flex justify-between gap-3">
                      <span className="truncate text-ink-2">{round}</span>
                      <span className="num shrink-0 font-bold text-ink-2">
                        {m.best} of {m.total}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {tests.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-extrabold uppercase tracking-[0.12em] text-violet-ink">Area tests, latest</p>
                <ul className="space-y-1 text-sm">
                  {tests.map(([id, a]) => (
                    <li key={id} className="flex justify-between gap-3">
                      <span className="truncate text-ink-2">{areaName.get(id) ?? 'Phase 3 readiness'}</span>
                      <span className="num shrink-0 font-bold text-ink-2">
                        {a.right} of {a.total}
                        {a.passed ? ', passed' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {weak > 0 && (
              <button type="button" onClick={onWeak} className="block text-sm font-extrabold text-brand-ink">
                Practise your {weak} weak {weak === 1 ? 'spot' : 'spots'} →
              </button>
            )}
          </Card>
        </section>
      </div>

      <section>
        <SectionTitle aside={<Legend />}>By area</SectionTitle>
        <Card>
          <ul className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:gap-y-4 lg:space-y-0">
            {areas.map((a) => (
              <li key={a.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-bold text-ink">{a.name}</span>
                  <span className="num shrink-0 text-ink-3">
                    {a.known} of {a.total} known · {pct(accuracy(a.right, a.wrong))} right
                  </span>
                </div>
                <div className="mt-1.5 flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-sunken" role="img" aria-label={`${a.name}: ${a.known} known and ${a.met - a.known} more met, of ${a.total} terms`}>
                  {a.known > 0 && <span className="h-full rounded-full bg-brand" style={{ width: `${(a.known / a.total) * 100}%` }} />}
                  {a.met > a.known && <span className="h-full rounded-full bg-brand/35" style={{ width: `${((a.met - a.known) / a.total) * 100}%` }} />}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-3 py-3 shadow-card">
      <p className="num text-2xl font-extrabold text-ink">{value}</p>
      <p className="text-xs font-bold text-ink-3">{label}</p>
    </div>
  );
}

function Legend() {
  return (
    <span className="flex items-center gap-3 text-xs font-bold text-ink-3">
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-full bg-brand" />
        Known
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-full bg-brand/35" />
        Met
      </span>
    </span>
  );
}

/** One bar per week: terms first met that week. Hover or tap a bar for the numbers; a table carries the same for screen readers. */
function WeekBars({ weeks }: { weeks: WeekStat[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...weeks.map((w) => w.added));
  const shown = hover ?? weeks.length - 1;
  const w = weeks[shown];
  return (
    <div>
      <p className="num h-10 text-sm text-ink-2" aria-live="polite">
        <span className="font-bold text-ink">Week of {shortDay(w.start)}:</span> {w.added} new {w.added === 1 ? 'term' : 'terms'}, {w.xp} XP
        <br />
        <span className="text-ink-3">{w.total} met by the end of the week</span>
      </p>
      <div className="mt-3 flex h-32 items-end gap-1.5 border-b border-line" aria-hidden="true">
        {weeks.map((wk, i) => (
          <button
            key={wk.start}
            type="button"
            tabIndex={-1}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => setHover(i)}
            className="flex h-full flex-1 items-end"
          >
            <span
              className={`w-full rounded-t-[4px] transition ${i === shown ? 'bg-brand' : 'bg-brand/45'}`}
              style={{ height: wk.added ? `${Math.max(4, (wk.added / max) * 100)}%` : '2px' }}
            />
          </button>
        ))}
      </div>
      <div className="num mt-1 flex justify-between text-[11px] text-ink-3" aria-hidden="true">
        <span>{shortDay(weeks[0].start)}</span>
        <span>This week</span>
      </div>
      <table className="sr-only">
        <caption>New terms by week</caption>
        <thead>
          <tr>
            <th>Week of</th>
            <th>New terms</th>
            <th>Met by then</th>
            <th>XP</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((wk) => (
            <tr key={wk.start}>
              <td>{wk.start}</td>
              <td>{wk.added}</td>
              <td>{wk.total}</td>
              <td>{wk.xp}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
