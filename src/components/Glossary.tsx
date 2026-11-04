import { useMemo, useState } from 'react';
import { categories, isCore } from '../lib/content';
import type { Progress } from '../lib/types';
import { SpeakButton, TermDetails } from './ui';

export function Glossary({ progress, onBack }: { progress: Progress; onBack: () => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const q = query.trim().toLowerCase();

  const groups = useMemo(
    () =>
      categories.map((c) => ({
        cat: c,
        terms: c.terms
          .filter(
            (t) =>
              !q ||
              t.term.toLowerCase().includes(q) ||
              t.aliases?.some((a) => a.toLowerCase().includes(q)) ||
              t.short.toLowerCase().includes(q),
          )
          .sort((a, b) => a.term.localeCompare(b.term)),
      })),
    [q],
  );

  return (
    <div className="mx-auto max-w-xl px-4 pb-16 pt-6">
      <div className="mb-4 flex items-center gap-3">
        <button onClick={onBack} className="rounded-lg px-2 py-1 font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
          ← Back
        </button>
        <h1 className="text-2xl font-black text-slate-800 dark:text-white">Glossary</h1>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search terms"
        className="mb-5 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-base outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
      />
      {groups.map(({ cat, terms }) =>
        terms.length ? (
          <section key={cat.id} className="mb-6">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{cat.name}</h2>
            <ul className="divide-y-2 divide-slate-100 overflow-hidden rounded-2xl border-2 border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
              {terms.map((t) => {
                const s = progress.terms[t.id];
                const expanded = open === t.id;
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => setOpen(expanded ? null : t.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      aria-expanded={expanded}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">{t.term}</span>
                        {isCore(t.id) && <span className="ml-2 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-700 dark:bg-brand-700/30 dark:text-brand-400">core</span>}
                        <span className="block truncate text-sm text-slate-500 dark:text-slate-400">{t.short}</span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">{s ? `step ${s.step}` : 'not met'}</span>
                    </button>
                    {expanded && (
                      <div className="space-y-3 px-4 pb-4">
                        <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                          <SpeakButton term={t} enabled={progress.settings.voice} />
                          <span>
                            {t.said ? `Say it: ${t.said}` : ''}
                            {t.aliases?.length ? `${t.said ? ' · ' : ''}Also: ${t.aliases.join(', ')}` : ''}
                          </span>
                        </div>
                        <TermDetails term={t} showExamples={3} />
                        {s && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Step {s.step} of 6 · next review {s.due} · {s.correct} right, {s.wrong} wrong{s.trouble ? ' · trouble term' : ''}
                          </p>
                        )}
                        {t.source && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Checked {t.asOf}: <a className="underline" href={t.source} target="_blank" rel="noreferrer">source</a>
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
