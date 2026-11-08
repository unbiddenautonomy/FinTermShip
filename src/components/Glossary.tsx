import { useMemo, useState, type ReactNode } from 'react';
import { categories as allCategories, isCore, isPhase3Area } from '../lib/content';
import { phase3Open } from '../lib/phase3';
import type { Progress } from '../lib/types';
import { ChevronDown, Search } from './icons';
import { Pill, SpeakButton, StepDots, TermDetails } from './ui';

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
                t.short.toLowerCase().includes(q)
              );
            })
            .sort((a, b) => a.term.localeCompare(b.term)),
        })),
    [categories, q, cat, filter, progress.terms],
  );
  const shown = groups.reduce((n, g) => n + g.terms.length, 0);

  return (
    <div className="mx-auto max-w-xl px-4 pb-32 pt-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Glossary</h1>
        <span className="num text-sm font-semibold text-ink-3">{categories.reduce((n, c) => n + c.terms.length, 0)} terms</span>
      </div>

      <div className="sticky top-0 z-20 -mx-4 space-y-3 bg-bg/95 px-4 pb-3 pt-1 backdrop-blur">
        <label className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 focus-within:border-sky">
          <Search className="h-5 w-5 shrink-0 text-ink-3" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search terms, aliases or meanings"
            aria-label="Search terms"
            className="w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
          />
        </label>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <Chip active={cat === 'all'} onClick={() => setCat('all')}>
            All areas
          </Chip>
          {categories.map((c) => (
            <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
        <div className="flex gap-1 rounded-xl bg-sunken p-1 text-sm font-bold">
          {(['all', 'met', 'trouble'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`flex-1 rounded-lg py-1.5 transition ${filter === f ? 'bg-surface text-ink shadow-card' : 'text-ink-3'}`}
              aria-pressed={filter === f}
            >
              {f === 'all' ? 'All' : f === 'met' ? 'Met' : 'Needs work'}
            </button>
          ))}
        </div>
      </div>

      {shown === 0 && <p className="mt-10 text-center text-ink-3">{filter === 'all' ? 'No terms match.' : filter === 'met' ? 'No terms met yet in this view.' : 'Nothing needs work here. Nice.'}</p>}

      {groups.map(({ cat: c, terms }) =>
        terms.length ? (
          <section key={c.id} className="mt-4">
            <h2 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-[0.12em] text-ink-3">{c.name}</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              {terms.map((t) => {
                const s = progress.terms[t.id];
                const expanded = open === t.id;
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => setOpen(expanded ? null : t.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-sunken/60"
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
                        <span className="block truncate text-sm text-ink-3">{t.short}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {s ? <StepDots step={s.step} /> : <span className="text-xs font-semibold text-ink-3">not met</span>}
                        <ChevronDown className={`h-4 w-4 text-ink-3 transition ${expanded ? 'rotate-180' : ''}`} />
                      </span>
                    </button>
                    {expanded && (
                      <div className="space-y-4 bg-sunken/40 px-4 pb-5 pt-3">
                        {(t.said || t.aliases?.length || progress.settings.voice) && (
                          <div className="flex items-center gap-3 text-sm text-ink-3">
                            <SpeakButton term={t} enabled={progress.settings.voice} size="sm" />
                            <span>
                              {t.said ? `Say it: ${t.said}` : ''}
                              {t.aliases?.length ? `${t.said ? ' · ' : ''}Also: ${t.aliases.join(', ')}` : ''}
                            </span>
                          </div>
                        )}
                        <TermDetails term={t} showExamples={3} />
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
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-bold transition ${active ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink-2 hover:bg-sunken'}`}
    >
      {children}
    </button>
  );
}
