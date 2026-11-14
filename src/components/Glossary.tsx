import { useMemo, useState, type ReactNode } from 'react';
import { categories as allCategories, glossOrUnit, hasCard, isCore, isPhase3Area } from '../lib/content';
import { phase3Open } from '../lib/phase3';
import { areas } from '../lib/modes/status';
import type { Progress, Term } from '../lib/types';
import { ChevronDown, Search } from './icons';
import { Pill, SpeakButton, StepDots, TermDetails } from './ui';
import { useTermCards } from './useCards';

type Filter = 'all' | 'met' | 'trouble';

export function Glossary({ progress, initialQuery = '' }: { progress: Progress; initialQuery?: string }) {
  // Drill-only areas have no terms to look up, and phase 3 stays hidden until it's open.
  const open3 = phase3Open(progress);
  const categories = useMemo(() => allCategories.filter((c) => c.terms.length > 0 && (open3 || !isPhase3Area(c.id))), [open3]);
  const [query, setQuery] = useState(initialQuery);
  const [cat, setCat] = useState<string>('all');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);
  const q = query.trim().toLowerCase();

  const groups = useMemo(
    () =>
      categories
        .filter((c) => cat === 'all' || c.id === cat)
        .map((c) => ({
          cat: c,
          terms: c.terms
            .filter((t) => {
              const s = progress.terms[t.id];
              if (filter === 'met' && !s) return false;
              if (filter === 'trouble' && !s?.trouble && !(s && s.wrong > s.correct)) return false;
              return (
                !q ||
                t.term.toLowerCase().includes(q) ||
                t.aliases?.some((a) => a.toLowerCase().includes(q)) ||
                (hasCard(t.id) && t.short.toLowerCase().includes(q))
              );
            })
            .sort((a, b) => a.term.localeCompare(b.term)),
        })),
    [categories, q, cat, filter, progress.terms],
  );
  // Each area is a titled section, shut until tapped. Searching, or picking one area, opens what matches.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const isOpen = (id: string) => cat !== 'all' || !!q || expanded.has(id);
  const toggle = (id: string) => {
    const opening = !expanded.has(id);
    setExpanded((e) => {
      const n = new Set(e);
      if (opening) n.add(id);
      else n.delete(id);
      return n;
    });
    if (opening) requestAnimationFrame(() => document.getElementById(`area-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  // Opening the glossary fetches nothing. An open section fetches the glosses of its met terms, a screen's worth at a time.
  useTermCards(groups.filter((g) => isOpen(g.cat.id)).flatMap((g) => g.terms.filter((t) => progress.terms[t.id]).map((t) => t.id)).slice(0, 80));
  const openTerm = open ? categories.flatMap((c) => c.terms).find((t) => t.id === open) : undefined;
  const shown = groups.reduce((n, g) => n + g.terms.length, 0);


  return (
    <div className="mx-auto max-w-xl px-4 pb-32 pt-5 lg:grid lg:max-w-[100rem] lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-x-8 lg:px-8 lg:pb-12 lg:pt-8 2xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="min-w-0">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-display font-semibold tracking-tight text-ink">Glossary</h1>
        <span className="num text-sm font-semibold text-ink-3">{categories.reduce((n, c) => n + c.terms.length, 0)} terms</span>
      </div>

      {/* Only this compact bar stays put; the term list scrolls with the whole page. The area chips scroll sideways on one row. */}
      <div className="sticky top-0 z-20 -mx-4 space-y-2 bg-bg/95 px-4 pb-2 pt-1 backdrop-blur lg:mx-0 lg:px-0">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-2.5 focus-within:border-sky">
            <Search className="h-5 w-5 shrink-0 text-ink-3" />
            <input
              type="search"
              id="glossary-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search terms, aliases or meanings"
              aria-label="Search terms"
              className="w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
            />
          </label>
          <div className="flex shrink-0 gap-1 rounded-xl bg-sunken p-1 text-sm font-bold lg:w-72">
            {(['all', 'met', 'trouble'] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`flex-1 rounded-lg py-1 transition ${filter === f ? 'bg-surface text-ink shadow-card' : 'text-ink-3'}`}
                aria-pressed={filter === f}
              >
                {f === 'all' ? 'All' : f === 'met' ? 'Met' : 'Needs work'}
              </button>
            ))}
          </div>
        </div>
        <div className="relative -mx-4 lg:mx-0">
          <div
            className="flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:px-0 lg:pr-10 lg:[scrollbar-width:thin]"
            role="group"
            aria-label="Areas"
          >
            <Chip active={cat === 'all'} onClick={() => setCat('all')}>
              All areas
            </Chip>
            {categories.map((c) => (
              <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-bg to-transparent" aria-hidden />
        </div>
      </div>

      {shown === 0 && <p className="mt-10 text-center text-ink-3">{filter === 'all' ? 'No terms match.' : filter === 'met' ? 'No terms met yet in this view.' : 'Nothing needs work here. Nice.'}</p>}

      {groups.map(({ cat: c, terms }) =>
        terms.length ? (
          <section key={c.id} id={`area-${c.id}`} className="mt-3 scroll-mt-36">
            {cat === 'all' && !q ? (
              <button
                type="button"
                onClick={() => toggle(c.id)}
                aria-expanded={isOpen(c.id)}
                className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left shadow-card transition hover:bg-sunken/60"
              >
                <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: areas[c.id]?.colour ?? 'rgb(var(--brand))' }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-ink">{c.name}</span>
                  <span className="num block text-xs text-ink-3">
                    {terms.filter((t) => progress.terms[t.id]).length} of {terms.length} met
                  </span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-ink-3 transition ${isOpen(c.id) ? 'rotate-180' : ''}`} />
              </button>
            ) : (
              <h2 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-[0.12em] text-violet-ink">{c.name}</h2>
            )}
            {isOpen(c.id) && (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card lg:grid lg:grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] lg:gap-2 lg:divide-y-0 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none">
              {terms.map((t) => {
                const s = progress.terms[t.id];
                const expanded = open === t.id;
                return (
                  <li key={t.id} className="lg:overflow-hidden lg:rounded-xl lg:border lg:border-line lg:bg-surface lg:shadow-card">
                    <button
                      onClick={() => setOpen(expanded ? null : t.id)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left lg:h-full lg:py-2.5 transition hover:bg-sunken/60 ${expanded ? 'lg:bg-brand-soft' : ''}`}
                      aria-expanded={expanded}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-bold text-ink">{t.term}</span>
                          {isCore(t.id) && (
                            <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-brand-ink">core</span>
                          )}
                          {(t.calcs?.length ?? 0) > 0 && (
                            <span className="rounded-md bg-violet-soft px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-violet-ink">sums</span>
                          )}
                        </span>
                        <span className="block truncate text-sm text-ink-3">{glossOrUnit(t)}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {s ? <StepDots step={s.step} /> : <span className="text-xs font-semibold text-ink-3">not met</span>}
                        <ChevronDown className={`h-4 w-4 text-ink-3 transition lg:hidden ${expanded ? 'rotate-180' : ''}`} />
                      </span>
                    </button>
                    {expanded && (
                      <div className="bg-sunken/40 px-4 pb-5 pt-3 lg:hidden">
                        <TermBody term={t} progress={progress} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            )}
          </section>
        ) : null,
      )}
      </div>

      <aside className="sticky top-8 hidden max-h-[calc(100dvh-4rem)] overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-card lg:block" aria-label="Term details">
        {openTerm ? (
          <>
            <h2 className="mb-4 text-2xl font-extrabold tracking-tight text-ink">{openTerm.term}</h2>
            <TermBody term={openTerm} progress={progress} />
          </>
        ) : (
          <p className="py-16 text-center text-ink-3">Pick a term to see what it means, how it is used, and how well you know it.</p>
        )}
      </aside>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-[13px] font-bold transition ${active ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink-2 hover:bg-sunken'}`}
    >
      {children}
    </button>
  );
}

/** What a term card shows when opened: inline on a phone, in the side pane on a laptop. */
function TermBody({ term: t, progress }: { term: Term; progress: Progress }) {
  const s = progress.terms[t.id];
  return (
    <div className="space-y-4">
      {(t.said || t.aliases?.length || progress.settings.voice) && (
        <div className="flex items-center gap-3 text-sm text-ink-3">
          <SpeakButton term={t} enabled={progress.settings.voice} size="sm" />
          <span>
            {t.said ? `Say it: ${t.said}` : ''}
            {t.aliases?.length ? `${t.said ? ' · ' : ''}Also: ${t.aliases.join(', ')}` : ''}
          </span>
        </div>
      )}
      <TermDetails term={t} met={!!s} showExamples={3} />
      {s && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
          <Pill tone={s.step >= 4 ? 'brand' : 'sky'}>Step {s.step} of 6</Pill>
          {s.trouble && <Pill tone="bad">Trouble term</Pill>}
          <span>
            Next review {s.due} · {s.correct} right, {s.wrong} wrong
          </span>
        </div>
      )}
      {t.source && (
        <p className="text-xs text-ink-3">
          Checked {t.asOf}:{' '}
          <a className="font-bold text-sky-ink underline" href={t.source} target="_blank" rel="noreferrer">
            source
          </a>
        </p>
      )}
    </div>
  );
}
