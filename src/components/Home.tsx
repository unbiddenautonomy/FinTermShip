import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { areaCoreSize, canTakeTest, focusActive, focusLeft, unitOpen } from '../lib/choose';
import { hasCard, isPhase3Area, isQuantArea, practiceKind, termById, unitById, unitSize } from '../lib/content';
import { weakSpots, WEAK_MIN } from '../lib/weak';
import { gameSpec } from '../lib/games';
import { addDays, daysBetween } from '../lib/dates';
import { todayStatus } from '../lib/lesson';
import { PHASE3, phase3Open, reachableCount } from '../lib/phase3';
import { KIND_LABEL, passRule, practiceAbout, recordLine, roundSize } from '../lib/practice';
import { dayStats, isKnown } from '../lib/scheduler';
import { comma, mocksReady, targetRole } from '../lib/profile';
import { currentUnit, isDrill, track, unitDone, type PathRow } from '../lib/track';
import type { Progress } from '../lib/types';
import { Briefcase, Calculator, Check, ChevronDown, Cross, Dice, Flame, Lock } from './icons';
import { AboutYou } from './AboutYou';
import { Phase3Gate } from './Phase3Gate';
import { Bar, Button, Card, Pill, Ring, SectionTitle, StepDots } from './ui';
import { useTermCards } from './useCards';

interface Props {
  progress: Progress;
  today: string;
  onStart: (ignoreNewCap: boolean) => void;
  onPractice: (unitId: string) => void;
  /** A practice round on the most-missed terms. */
  onWeak: () => void;
  onFocus: (unitId: string | null) => void;
  /** An area test, or the phase 3 readiness test (PHASE3). */
  onTest: (categoryId: string) => void;
  onDrill: (unitId: string) => void;
  /** The password was entered for phase 3. */
  onPhase3Key: () => void;
  onOpenSettings: () => void;
  onOpenCareers: () => void;
  /** The unit sheet open over this screen, if any. App holds it so the address bar and Back can reach it. */
  sheet: string | null;
  onSheet: (unitId: string | null) => void;
  showInstallHint: boolean;
  /** Saves a change made on this screen, such as the About you card. */
  onProgress: (p: Progress) => void;
  /** Signed in, so progress is kept on the account and the backup nudge isn't needed. */
  signedIn: boolean;
}

type Row = PathRow & { i: number; met: number; known: number; total: number; open: boolean; drill: boolean; done: boolean };

export function Home({ progress, today, onStart, onPractice, onWeak, onFocus, onTest, onDrill, onPhase3Key, onOpenSettings, onOpenCareers, sheet, onSheet, showInstallHint, onProgress, signedIn }: Props) {
  const picked = focusActive(progress) && progress.focus ? unitById.get(progress.focus) : undefined;
  const status = todayStatus(progress, today);
  const todayStats = dayStats(progress, today);
  const goal = progress.settings.newPerDay;
  const hasWork = status.due > 0 || status.newLeft > 0 || !!status.drill;
  const metCount = Object.keys(progress.terms).length;
  const backupDue = !signedIn && metCount >= 20 && (!progress.lastBackup || daysBetween(progress.lastBackup, today) >= 7);
  const practisedToday = todayStats.lessons > 0;
  const gate = <Phase3Gate progress={progress} today={today} onKey={onPhase3Key} onTest={() => onTest(PHASE3)} />;

  const you = comma(progress);
  const headline = !hasWork
    ? status.newAvailable === 0
      ? `Every term met${you}`
      : `Daily goal done${you}`
    : practisedToday
      ? `Keep it going${you}`
      : `Ready for today${you}?`;
  const weak = weakSpots(progress);
  const role = targetRole(progress);
  const mocks = mocksReady(progress);
  const subline = !hasWork
    ? status.newAvailable === 0
      ? 'Reviews will come back on schedule.'
      : 'Nice work. Come back tomorrow, or learn a few more.'
    : [
        status.due ? `${status.due} review${status.due === 1 ? '' : 's'} due` : null,
        status.drill ? null : status.newLeft ? `${status.newLeft} new term${status.newLeft === 1 ? '' : 's'} left` : null,
      ]
        .filter(Boolean)
        .join(' · ') + (status.slowed ? '. New terms slow down while reviews are heavy.' : '');

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 pb-32 pt-5 lg:grid lg:max-w-6xl lg:grid-flow-row-dense lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start lg:gap-x-10 lg:px-8 lg:pb-12 lg:pt-8">
      {/* The wordmark is a picture; this is the page's heading, for anyone listening to it. */}
      <h1 className="sr-only">Learn</h1>

      {showInstallHint && (
        <div className="rounded-2xl border border-amber/40 bg-amber-soft px-4 py-3 text-sm leading-relaxed text-amber-ink lg:col-span-2">
          On iPhone, tap Share, then <b>Add to Home Screen</b>. Safari can clear a website's saved progress after 7 days unused; the home screen app keeps it.
        </div>
      )}

      {/* After the day's card on a phone: the first thing a new learner should see is Start lesson. */}
      {!progress.settings.aboutAsked && (
        <Card className="order-2 space-y-3 lg:order-none lg:col-span-2">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-violet-ink">About you</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-2">Two optional questions, so the app can greet you and point you at the right interview practice.</p>
          </div>
          <AboutYou
            inline
            progress={progress}
            onSave={onProgress}
            onSkip={() => onProgress({ ...progress, settings: { ...progress.settings, aboutAsked: true } })}
          />
        </Card>
      )}

      {/* On a phone these flow around the path; on a laptop they sit in a column beside it. */}
      <aside className="contents lg:sticky lg:top-8 lg:col-start-2 lg:flex lg:flex-col lg:gap-6">
      <Card className="order-1 space-y-5 lg:order-none">
        <div className="flex items-center gap-5">
          <Ring value={todayStats.newTerms} max={goal} size={92} stroke={9} tone="violet" label={`${todayStats.newTerms} of ${goal} new terms today`}>
            <div className="text-center leading-none">
              <p className="num text-2xl font-extrabold text-ink">{todayStats.newTerms}</p>
              <p className="mt-1 text-[11px] font-bold text-ink-3">of {goal} new</p>
            </div>
          </Ring>
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-violet-ink">Today</p>
            <p className="mt-1 text-xl font-extrabold text-ink">{headline}</p>
            {subline && <p className="mt-1 text-sm leading-snug text-ink-2">{subline}</p>}
            {status.drill ? (
              <p className="mt-1.5 text-sm font-semibold leading-snug text-violet-ink">
                Up next{picked?.id === status.drill ? ', your pick' : ''}: {unitById.get(status.drill)?.name}, {upNext(status.drill)}.
              </p>
            ) : (
              picked &&
              hasWork && <p className="mt-1.5 text-sm font-semibold leading-snug text-brand-ink">New terms come from your pick: {picked.name}.</p>
            )}
          </div>
        </div>

        <WeekStrip progress={progress} today={today} />

        {hasWork ? (
          <Button onClick={() => onStart(false)} className="w-full text-base">
            {practisedToday ? 'Continue' : 'Start lesson'}
          </Button>
        ) : (
          status.newAvailable > 0 && (
            <Button variant="secondary" onClick={() => onStart(true)} className="w-full">
              Learn 4 more terms
            </Button>
          )
        )}
      </Card>


      {sheet && (
        <UnitSheets
          unitId={sheet}
          progress={progress}
          today={today}
          onClose={() => onSheet(null)}
          onPractice={onPractice}
          onDrill={onDrill}
          onFocus={(id) => {
            onFocus(id);
            // Bring the Today card into view: it now says where new terms come from.
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onTest={onTest}
          onPhase3Key={onPhase3Key}
        />
      )}

      {weak.length >= WEAK_MIN && (
        <Card className="order-1 space-y-3 lg:order-none">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-bad-ink">Weak spots</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-2">
              The {weak.length} terms you miss most often. A short round on them doesn't touch your review schedule, and right answers take them off this list.
            </p>
          </div>
          <ul className="flex flex-wrap gap-1.5" aria-label="Weak terms">
            {weak.map((id) => (
              <li key={id} className="rounded-full bg-bad-soft px-2.5 py-1 text-xs font-bold text-bad-ink">
                {termById.get(id)?.term}
              </li>
            ))}
          </ul>
          <Button variant="secondary" onClick={onWeak} className="w-full">
            Practise weak spots
          </Button>
        </Card>
      )}

      {role && (
        <button
          type="button"
          onClick={onOpenCareers}
          className="order-3 flex lg:order-none w-full items-center gap-3 rounded-2xl border border-violet/30 bg-violet-soft px-4 py-3 text-left transition hover:border-violet/60 active:scale-[0.99]"
        >
          <span className="num flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-surface text-violet-ink">
            <Briefcase className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-ink">
              {`Preparing for ${role.title.toLowerCase()} roles`}
            </span>
            <span className="block text-sm text-ink-2">
              Timed mock rounds interview-ready: {mocks.ready} of {mocks.total}.{' '}
              {mocks.ready < mocks.total ? 'Try one on the career map.' : 'All of them, nicely done.'}
            </span>
          </span>
        </button>
      )}

      <button
        type="button"
        onClick={onOpenCareers}
        className="order-3 flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left transition hover:border-brand/50 active:scale-[0.99] lg:order-none"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-soft text-violet-ink">
          <Briefcase className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-ink">Career map</span>
          <span className="block text-sm text-ink-2">Quant and trading jobs, the interview rounds, and the units that prepare you for each.</span>
        </span>
      </button>

      {backupDue && (
        <div className="order-3 flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink-2 lg:order-none">
          <span className="flex-1">Progress lives on this device only. Save a backup once a week to be safe.</span>
          <button className="shrink-0 font-extrabold text-brand-ink" onClick={onOpenSettings}>
            Back up
          </button>
        </div>
      )}

      </aside>

      <div className="order-2 min-w-0 lg:order-none lg:col-start-1">
        <LearningPath progress={progress} today={today} onOpen={onSheet} gate={gate} />
      </div>
    </div>
  );
}

function WeekStrip({ progress, today }: { progress: Progress; today: string }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  return (
    <div className="flex justify-between rounded-2xl bg-sunken px-3 py-2.5">
      {days.map((d) => {
        const done = (progress.days[d]?.lessons ?? 0) > 0;
        const [y, m, dd] = d.split('-').map(Number);
        const letter = new Date(y, m - 1, dd).toLocaleDateString('en-IN', { weekday: 'narrow' });
        const isToday = d === today;
        return (
          <div key={d} className="flex flex-col items-center gap-1.5">
            <span className={`text-[11px] font-bold ${isToday ? 'text-ink' : 'text-ink-3'}`}>{letter}</span>
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full ${done ? 'bg-amber text-white' : isToday ? 'border-2 border-dashed border-amber/60' : 'bg-line/70'}`}
              role="img"
              aria-label={`${d}${done ? ', practised' : ''}`}
            >
              {done && <Flame className="h-3.5 w-3.5" />}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function pathRows(progress: Progress): Row[] {
  return track(progress).map((r, i) => {
    const met = r.terms.filter((t) => progress.terms[t.id]).length;
    const known = r.terms.filter((t) => isKnown(progress.terms[t.id])).length;
    return { ...r, i, met, known, total: unitSize(r.unit.id), open: unitOpen(progress, r.unit.id), drill: isDrill(r), done: unitDone(progress, r) };
  });
}

/** The unit the learner is on: their pick, or the first open unit with work left. */
function currentIndex(progress: Progress, rows: Row[], today: string): number {
  const id = currentUnit(progress, today);
  return id ? rows.findIndex((r) => r.unit.id === id) : -1;
}

function LearningPath({ progress, today, onOpen, gate }: { progress: Progress; today: string; onOpen: (unitId: string) => void; gate: ReactNode }) {
  const [full, setFull] = useState(false);
  const rows = pathRows(progress);
  const currentIdx = currentIndex(progress, rows, today);
  const picked = currentIdx >= 0 && rows[currentIdx].unit.id === progress.focus;
  const done = rows.filter((r) => r.done).length;
  const reachable = reachableCount(progress);

  if (!full) {
    const shown = [rows[currentIdx], ...rows.filter((r) => !r.done && r.i !== currentIdx).slice(0, 2)].filter(Boolean);
    return (
      <section>
        <SectionTitle aside={`${reachable.met} of ${reachable.total} terms met`}>Your path</SectionTitle>
        <p className="-mt-1 mb-3 px-1 text-sm text-ink-2">
          {done > 0 ? `${done} of ${rows.length} units done. ` : ''}Tap a unit to see what's in it, practise it, or do it next.
          {progress.settings.quantFirst ? ' Quant areas come first.' : ''}
        </p>
        <ol>
          {shown.map((r, n) => (
            <PathStop key={r.unit.id} r={r} progress={progress} current={r.i === currentIdx} picked={picked && r.i === currentIdx} last={n === shown.length - 1} onOpen={onOpen} />
          ))}
        </ol>
        <Button variant="secondary" className="mt-1 w-full" onClick={() => setFull(true)}>
          See full path ({rows.length} units)
        </Button>
      </section>
    );
  }

  const open3 = phase3Open(progress);
  const phase3 = {
    key: 'p3',
    title: 'Phase 3 · Strategies',
    note: open3
      ? 'Trading strategies, starting with options and futures. Pick any unit to learn next.'
      : 'Trading strategies, starting with options and futures. They come after everything else, or open early with the password and a readiness test.',
    rows: rows.filter((r) => r.pass === 3),
  };
  const sections = progress.settings.quantFirst
    ? [
        {
          key: 'quant',
          title: 'Quant first',
          note: 'Opened by the quant switch: maths and probability, quant and risk, options, futures, microstructure and execution, core units first.',
          rows: rows.filter((r) => isQuantArea(r.category.id)),
        },
        {
          key: 'rest',
          title: 'Everything else',
          note: "The other areas, core units first. An area's advanced units open once you've learned its core terms, or passed its test.",
          rows: rows.filter((r) => !isQuantArea(r.category.id) && r.pass !== 3),
        },
        phase3,
      ]
    : [
        { key: 'p1', title: 'Pass 1 · Core sweep', note: 'The most common terms, the first timed drills and the market-making game, from every area.', rows: rows.filter((r) => r.pass === 1) },
        {
          key: 'p2',
          title: 'Pass 2 · Go deeper',
          note: "Each area in depth. An area's advanced units open once you've done its core units, or passed its test.",
          rows: rows.filter((r) => r.pass === 2),
        },
        phase3,
      ];

  return (
    <div className="space-y-3">
      {sections.map((sec) => (
        <PathSection key={sec.key} sec={sec} progress={progress} currentIdx={currentIdx} picked={picked} onOpen={onOpen} gate={sec.key === 'p3' && !open3 ? gate : null} />
      ))}
      <Button variant="secondary" className="w-full" onClick={() => setFull(false)}>
        Show less
      </Button>
    </div>
  );
}

/** Units a path section shows at a time; Show more adds as many again. */
const UNITS_SHOWN = 15;

/**
 * One section of the full path: a title that opens it, then its units a page at a time. The section
 * holding the learner's current unit starts open, with enough shown to include it.
 */
function PathSection({
  sec,
  progress,
  currentIdx,
  picked,
  onOpen,
  gate,
}: {
  sec: { key: string; title: string; note: string; rows: Row[] };
  progress: Progress;
  currentIdx: number;
  picked: boolean;
  onOpen: (unitId: string) => void;
  gate: ReactNode;
}) {
  const here = sec.rows.findIndex((r) => r.i === currentIdx);
  const [open, setOpen] = useState(here >= 0);
  const [count, setCount] = useState(() => Math.max(UNITS_SHOWN, Math.ceil((here + 1) / UNITS_SHOWN) * UNITS_SHOWN));
  const secDone = sec.rows.filter((r) => r.done).length;
  const rows = sec.rows.slice(0, count);
  const left = sec.rows.length - rows.length;
  return (
    <section id={`path-${sec.key}`} className="scroll-mt-4">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          if (!open) requestAnimationFrame(() => document.getElementById(`path-${sec.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        }}
        aria-expanded={open}
        className="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-left shadow-card transition hover:bg-sunken/60"
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-violet-ink">{sec.title}</span>
          <span className="flex items-center gap-2 text-xs font-semibold text-ink-3">
            {secDone} of {sec.rows.length} units done
            <ChevronDown className={`h-4 w-4 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
          </span>
        </span>
        <Bar value={secDone} max={sec.rows.length} className="mt-2 h-1.5" label={`${sec.title} progress`} />
      </button>
      {open && (
        <div className="mt-3">
          <p className="mb-3 px-1 text-sm text-ink-2">{sec.note}</p>
          {gate && <div className="mb-4">{gate}</div>}
          <ol>
            {rows.map((r, k) => (
              <PathStop key={r.unit.id} r={r} progress={progress} current={r.i === currentIdx} picked={picked && r.i === currentIdx} last={k === rows.length - 1} onOpen={onOpen} />
            ))}
          </ol>
          {left > 0 && (
            <Button variant="secondary" className="mt-1 w-full" onClick={() => setCount(count + UNITS_SHOWN)}>
              Show {Math.min(left, UNITS_SHOWN)} more ({left} left)
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

/** The Today card's line for a practice unit that's up next. */
function upNext(unitId: string): string {
  const kind = practiceKind(unitId);
  if (kind === 'drill') return `${roundSize(unitId)} against the clock`;
  if (kind === 'game') return `a game of ${roundSize(unitId)}`;
  return `a desk case of ${roundSize(unitId)}`;
}

const KIND_ICON = { drill: Calculator, game: Dice, case: Briefcase };

function PathStop({
  r,
  progress,
  current,
  picked,
  last,
  onOpen,
}: {
  r: Row;
  progress: Progress;
  current: boolean;
  picked: boolean;
  last: boolean;
  onOpen: (unitId: string) => void;
}) {
  const kind = practiceKind(r.unit.id);
  const KindIcon = kind ? KIND_ICON[kind] : Calculator;
  // The row reads out as what it shows, with the kind and the lock said rather than drawn.
  const stat = r.drill ? recordLine(progress, r.unit.id) : `${r.met}/${r.total} met${r.known ? ` · ${r.known} known` : ''}`;
  const said = [kind ? KIND_LABEL[kind] : '', r.open ? '' : 'locked'].filter(Boolean).join(', ');
  return (
    <li className="relative flex gap-4 pb-3">
      {!last && <span className={`absolute left-[23px] top-12 h-[calc(100%-36px)] w-0.5 ${r.done ? 'bg-brand/40' : 'bg-line'}`} aria-hidden="true" />}
      <div className="relative z-10">
        {r.done ? (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white shadow-press">
            <Check className="h-6 w-6" />
          </span>
        ) : !r.open ? (
          <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-line bg-sunken text-ink-3">
            <Lock className="h-5 w-5" />
          </span>
        ) : r.drill ? (
          <span
            className={`flex h-12 w-12 items-center justify-center rounded-full border-2 ${current ? 'border-brand bg-brand-soft text-brand-ink' : 'border-violet/50 bg-violet-soft text-violet-ink'}`}
          >
            <KindIcon className="h-5 w-5" />
          </span>
        ) : (
          <Ring value={r.met} max={r.total} size={48} stroke={5} tone={current ? 'brand' : 'violet'}>
            <span className={`num text-sm font-extrabold ${current ? 'text-brand-ink' : r.met ? 'text-ink-2' : 'text-ink-3'}`}>{r.i + 1}</span>
          </Ring>
        )}
      </div>
      <button
        type="button"
        onClick={() => onOpen(r.unit.id)}
        className={`min-w-0 flex-1 rounded-2xl border px-4 py-3 text-left transition hover:border-brand/50 active:scale-[0.99] ${current ? 'border-brand/50 bg-brand-soft/50' : 'border-line bg-surface'}`}
      >
        {said && <span className="sr-only">{said}. </span>}
        <span className="flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate font-bold ${r.open ? 'text-ink' : 'text-ink-2'}`}>{r.unit.name}</span>
          {current && <Pill tone="brand">{picked ? 'Your pick' : 'Up next'}</Pill>}
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2 text-xs text-ink-3">
          <span className="truncate">{r.category.name}</span>
          <span className="num shrink-0 font-semibold">
            {stat}
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * The sheet for one unit: a practice sheet for drills, games and cases, or the
 * term unit sheet. Shared by Learn, the career map and the guide, so opening a
 * unit from those screens keeps the learner where they were.
 */
export function UnitSheets({
  unitId,
  progress,
  today,
  onClose,
  onPractice,
  onDrill,
  onFocus,
  onTest,
  onPhase3Key,
}: {
  unitId: string;
  progress: Progress;
  today: string;
  onClose: () => void;
  onPractice: (unitId: string) => void;
  onDrill: (unitId: string) => void;
  onFocus: (unitId: string | null) => void;
  onTest: (categoryId: string) => void;
  onPhase3Key: () => void;
}) {
  const gate = <Phase3Gate progress={progress} today={today} onKey={onPhase3Key} onTest={() => onTest(PHASE3)} />;
  return practiceKind(unitId) ? (
    <PracticeSheet
      unitId={unitId}
      progress={progress}
      today={today}
      onClose={onClose}
      onStart={() => {
        onClose();
        onDrill(unitId);
      }}
      gate={gate}
    />
  ) : (
    <UnitSheet
      unitId={unitId}
      progress={progress}
      today={today}
      onClose={onClose}
      onPractice={() => onPractice(unitId)}
      onFocus={(id) => {
        onFocus(id);
        onClose();
      }}
      onTest={onTest}
      gate={gate}
    />
  );
}

/** Bottom sheet shared by term units and practice units. */
function Sheet({ kicker, title, sub, onClose, children, actions }: { kicker: string; title: string; sub: string; onClose: () => void; children: ReactNode; actions: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Rendered on <body>: on a laptop the sheet's caller sits in the sticky side column, which is its own
  // stacking context, so a sheet left there is painted under the path column beside it.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unit-title"
        onClick={(e) => e.stopPropagation()}
        className="pb-safe flex max-h-[88dvh] w-full max-w-xl animate-sheet flex-col rounded-t-3xl bg-surface shadow-sheet sm:rounded-3xl"
      >
        <div className="flex items-start gap-3 px-5 pb-3 pt-5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-violet-ink">{kicker}</p>
            <h2 id="unit-title" className="mt-1 text-xl font-extrabold text-ink">
              {title}
            </h2>
            <p className="num mt-0.5 text-sm text-ink-3">{sub}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-ink-3 transition hover:bg-sunken hover:text-ink-2" aria-label="Close">
            <Cross className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto px-5">{children}</div>
        <div className="space-y-2.5 px-5 pb-5 pt-4 empty:hidden">{actions}</div>
      </div>
    </div>,
    document.body,
  );
}

function LockedBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-sunken px-4 py-3 text-sm leading-relaxed text-ink-2">
      <p className="flex items-center gap-2 font-extrabold text-ink">
        <Lock className="h-4 w-4" /> Locked
      </p>
      {children}
    </div>
  );
}

function PracticeSheet({
  unitId,
  progress,
  today,
  onClose,
  onStart,
  gate,
}: {
  unitId: string;
  progress: Progress;
  today: string;
  onClose: () => void;
  onStart: () => void;
  gate: ReactNode;
}) {
  const rows = pathRows(progress);
  const r = rows.find((x) => x.unit.id === unitId);
  const kind = practiceKind(unitId);
  if (!r || !kind) return null;
  const rec = progress.drills?.[unitId];
  const isCurrent = currentIndex(progress, rows, today) === r.i;
  const noun = kind === 'drill' ? 'drill' : kind === 'game' ? 'game' : 'case';
  const how = {
    drill: 'Type each answer. The clock stops while you read the working for a miss.',
    game: gameSpec(unitId)?.how ?? '',
    case: "Pick the best call at each step. Every option says why it is or isn't the best one.",
  }[kind];
  const rule = passRule(unitId);
  // Phase 3 stays closed until it's opened, so the case's story stays hidden too.
  const shut3 = !r.open && isPhase3Area(r.category.id);
  return (
    <Sheet
      kicker={`${r.category.name} · ${r.pass === 3 ? 'Phase 3' : r.unit.core ? 'Core' : 'Advanced'} ${KIND_LABEL[kind]}`}
      title={r.unit.name}
      sub={`${roundSize(unitId)} · ${rule.charAt(0).toUpperCase()}${rule.slice(1)}`}
      onClose={onClose}
      actions={
        r.open && (
          <>
            <Button className="w-full" onClick={onStart}>
              {rec?.passed ? `Practise this ${noun}` : `Start ${noun}`}
            </Button>
            {isCurrent && !rec?.passed && <p className="px-1 text-center text-sm text-ink-2">This is next on your path.</p>}
            {rec?.snoozed === today && !rec.passed && <p className="px-1 text-center text-sm text-ink-2">Skipped for today. It's back on your path tomorrow.</p>}
          </>
        )
      }
    >
      {shut3 && gate}
      {!r.open && !shut3 && (
        <LockedBox>
          <p className="mt-1">
            {r.unit.core
              ? 'This opens with its area.'
              : `Opens once you've done the core ${r.category.name.toLowerCase()} units, or passed the area test${isQuantArea(r.category.id) ? ', or with the quant switch in Settings' : ''}.`}
          </p>
        </LockedBox>
      )}
      {!shut3 && (
        <div className="rounded-2xl border border-line px-4 py-3">
          <p className="leading-relaxed text-ink-2">{practiceAbout(unitId)}</p>
          <p className="mt-2 text-sm text-ink-3">{how}</p>
        </div>
      )}
      <div className="rounded-2xl border border-line px-4 py-3 text-sm text-ink-2">
        {rec ? (
          <>
            <p className="font-bold text-ink">{rec.passed ? 'Passed' : 'Not passed yet'}</p>
            <p className="num mt-0.5">
              {rec.rounds} go{rec.rounds === 1 ? '' : 'es'} · {recordLine(progress, unitId)}
            </p>
          </>
        ) : (
          <p>Not tried yet.</p>
        )}
      </div>
    </Sheet>
  );
}

function UnitSheet({
  unitId,
  progress,
  today,
  onClose,
  onPractice,
  onFocus,
  onTest,
  gate,
}: {
  unitId: string;
  progress: Progress;
  today: string;
  onClose: () => void;
  onPractice: () => void;
  onFocus: (unitId: string | null) => void;
  onTest: (categoryId: string) => void;
  gate: ReactNode;
}) {
  const rows = pathRows(progress);
  const r = rows.find((x) => x.unit.id === unitId);
  // The glosses of this unit's met terms, fetched as the sheet opens.
  useTermCards(r ? r.terms.filter((t) => progress.terms[t.id]).map((t) => t.id) : []);
  if (!r) return null;
  const area = r.category;
  const isCurrent = currentIndex(progress, rows, today) === r.i;
  const picked = progress.focus === unitId && focusLeft(progress) > 0;
  const unmetHere = r.total - r.met;
  // With Open everything on, a practice round takes any of the unit's terms, met or not (src/lib/openAll.ts).
  const practisable = progress.settings.openAll ? r.terms.length : r.met;
  const before = Math.max(0, focusLeft(progress, unitId) - unmetHere);
  const coreCount = areaCoreSize(area.id);
  // The app knows a term's name once it has been reached; the rest are only counted.
  const unknown = r.total - r.terms.length;
  const attempt = progress.tests?.[area.id];
  const testReady = canTakeTest(progress, area.id, today);
  // Phase 3 stays closed until it's opened, so its term list stays hidden too.
  const shut3 = !r.open && isPhase3Area(area.id);

  return (
    <Sheet
      kicker={`${area.name} · ${r.pass === 3 ? 'Phase 3' : r.unit.core ? 'Core' : 'Advanced'}`}
      title={r.unit.name}
      sub={`${r.met}/${r.total} met${r.known ? ` · ${r.known} known` : ''}`}
      onClose={onClose}
      actions={
        <>
          {!r.open && testReady && (
            <Button className="w-full" onClick={() => onTest(area.id)}>
              Take the {area.name} test ({coreCount} questions)
            </Button>
          )}
          {r.open && unmetHere > 0 && !isCurrent && (
            <>
              <Button className="w-full" onClick={() => onFocus(unitId)}>
                Learn this next
              </Button>
              {before > 0 && (
                <p className="px-1 text-center text-xs text-ink-3">
                  Starts with {before} earlier {area.name} term{before === 1 ? '' : 's'} it builds on.
                </p>
              )}
            </>
          )}
          {r.open && unmetHere > 0 && isCurrent && !picked && <p className="px-1 text-center text-sm text-ink-2">This is next on your path.</p>}
          {practisable >= 2 && (
            <Button variant={r.open && unmetHere > 0 && !isCurrent ? 'secondary' : 'primary'} className="w-full" onClick={onPractice}>
              Practise these ({Math.min(practisable, 8)} terms)
            </Button>
          )}
          {picked && (
            <Button variant="secondary" className="w-full" onClick={() => onFocus(null)}>
              Back to the usual order
            </Button>
          )}
        </>
      }
    >
      {shut3 && (
        <>
          {gate}
          <p className="px-1 text-sm text-ink-2">{r.total} terms, shown once phase 3 is open.</p>
        </>
      )}
      {!r.open && !shut3 && (
        <LockedBox>
          <p className="mt-1">
            {area.name} advanced units open once you've learned its {coreCount} core terms, or when you pass the {area.name} test.
          </p>
          {attempt && !attempt.passed && (
            <p className="mt-1">
              Last test: {attempt.right} of {attempt.total} right.{attempt.date === today ? ' You can try again tomorrow.' : ''}
            </p>
          )}
        </LockedBox>
      )}
      {!shut3 && (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {r.terms.map((t) => {
            const s = progress.terms[t.id];
            return (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-ink">{t.term}</span>
                  {hasCard(t.id) && <span className="block truncate text-xs text-ink-3">{t.short}</span>}
                </span>
                {s ? <StepDots step={s.step} /> : <span className="text-xs font-semibold text-ink-3">Not met</span>}
              </li>
            );
          })}
          {unknown > 0 && (
            <li className="px-4 py-2.5 text-sm font-semibold text-ink-3">
              {r.terms.length ? `${unknown} more to learn` : `${unknown} term${unknown === 1 ? '' : 's'} to learn`}
              {r.open ? '. Each one shows here once a lesson teaches it.' : '.'}
            </li>
          )}
        </ul>
      )}
    </Sheet>
  );
}
