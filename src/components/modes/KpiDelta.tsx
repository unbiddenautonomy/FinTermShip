import type { Kpis } from '../../lib/modes/knowledge';

/** The shared numbers before and after a session, so every mode shows what it changed in the same terms. */
export function KpiDelta({ before, after, note }: { before: Kpis; after: Kpis; note?: string }) {
  const rows: { label: string; a: number; b: number; fmt: (v: number) => string; goodUp: boolean }[] = [
    { label: 'Known', a: before.known, b: after.known, fmt: String, goodUp: true },
    { label: 'Due', a: before.due, b: after.due, fmt: String, goodUp: false },
    { label: 'Strength', a: before.strength, b: after.strength, fmt: (v) => v.toFixed(1), goodUp: true },
    { label: 'Coverage', a: before.coverage, b: after.coverage, fmt: (v) => `${Math.round(v * 100)}%`, goodUp: true },
  ];
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <dl className="grid grid-cols-4 gap-2">
        {rows.map((r) => {
          const d = r.b - r.a;
          const better = d === 0 ? null : d > 0 === r.goodUp;
          return (
            <div key={r.label}>
              <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-3">{r.label}</dt>
              <dd className="num font-mono text-lg font-semibold text-ink">{r.fmt(r.b)}</dd>
              <dd className={`num font-mono text-xs ${better === null ? 'text-ink-3' : better ? 'text-good-ink' : 'text-bad-ink'}`}>
                {d === 0 ? 'no change' : `${d > 0 ? '+' : '−'}${r.fmt(Math.abs(d)).replace('%', '')}${r.label === 'Coverage' ? ' pts' : ''}`}
              </dd>
            </div>
          );
        })}
      </dl>
      {note && <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-ink-3">{note}</p>}
    </div>
  );
}
