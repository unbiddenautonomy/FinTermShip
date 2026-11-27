/**
 * The network map for Term Lines: every area as a line, every unit as a station, in the order
 * Path teaches them, and the strongest interchanges drawn between lines. A link between two
 * units counts the pairs of terms across them that learners mix up (from the syllabus's
 * confusables), so the map shows real overlap without moving anything in the syllabus.
 */
import network from '../../data/modes/network.json';
import { unitOpen } from '../../lib/choose';
import { lines, namedTerms, stationCount } from '../../lib/modes/plans';
import { areas, unitStatus } from '../../lib/modes/status';
import { PIPE_STOPS, shade } from './metal';
import type { Progress } from '../../lib/types';

/** Links with at least this many mixed-up pairs are drawn; every interchange is still listed on each line. */
const MAP_MIN_LINK = 6;

const W = 360;
const LEFT = 10;
const RIGHT = 14;
const ROW = 40;
/** How thick a line's pipe is. */
const PIPE = 4.5;
const TOP = 30;

interface Station {
  x: number;
  y: number;
  line: string;
  core: boolean;
  depot: boolean;
  /** The unit's stretch of its line's stops. */
  from: number;
  to: number;
}

const allLinks = network.unitLinks as { a: string; b: string; n: number }[];
const lineOfUnit = new Map(lines.flatMap((l) => l.units.map((u) => [u.id, l.id] as const)));

/**
 * The order the lines are stacked in on the map (only on the map: Path, the line list and every
 * station's order are untouched). Lines that share many mixed-up terms sit next to each other, so
 * their interchanges are short and cross as few other lines as possible.
 */
function mapOrder(): string[] {
  const ids = lines.map((l) => l.id);
  const w = new Map<string, number>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const k of allLinks) {
    const a = lineOfUnit.get(k.a);
    const b = lineOfUnit.get(k.b);
    if (a && b && a !== b) w.set(key(a, b), (w.get(key(a, b)) ?? 0) + k.n);
  }
  const cost = (order: string[]) => {
    let c = 0;
    for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) c += (w.get(key(order[i], order[j])) ?? 0) * (j - i);
    return c;
  };
  const order = [...ids];
  let best = cost(order);
  for (let improved = true; improved; ) {
    improved = false;
    for (let i = 0; i < order.length; i++)
      for (let j = i + 1; j < order.length; j++) {
        [order[i], order[j]] = [order[j], order[i]];
        const c = cost(order);
        if (c < best) {
          best = c;
          improved = true;
        } else [order[i], order[j]] = [order[j], order[i]];
      }
  }
  return order;
}

const rows = mapOrder().map((id) => lines.find((l) => l.id === id)!);
const stations = new Map<string, Station>();
rows.forEach((l, row) => {
  const y = TOP + row * ROW;
  const n = l.units.length;
  const from = LEFT + 4;
  const span = W - RIGHT - 4 - from;
  // Stations sit in the middle of equal slots, nudged a little by row so stations on different lines rarely stack exactly.
  const nudge = ((row * 7) % 5) - 2;
  l.units.forEach((u, i) => {
    const first = l.stops[u.from];
    stations.set(u.id, {
      x: from + (span * (i + 0.5)) / n + nudge * 1.5,
      y,
      line: l.id,
      core: u.core,
      depot: !!first && 'depot' in first,
      from: u.from,
      to: u.to,
    });
  });
});

const links = allLinks.filter((k) => k.n >= MAP_MIN_LINK && stations.has(k.a) && stations.has(k.b));
const linked = new Set(links.flatMap((k) => [k.a, k.b]));

/** A smooth S-curve between two stations on different lines, leaving and arriving straight up and down. */
function connector(a: Station, b: Station): string {
  const [p, q] = a.y < b.y ? [a, b] : [b, a];
  const bend = (q.y - p.y) * 0.55;
  return `M${p.x},${p.y} C${p.x},${p.y + bend} ${q.x},${q.y - bend} ${q.x},${q.y}`;
}

const colourOf = (id: string) => areas[id]?.colour ?? '#777';
const SURFACE = 'rgb(var(--surface))';
const INK = 'rgb(var(--ink))';
const INK3 = 'rgb(var(--ink-3))';

export function NetworkMap({ progress, today, onLine }: { progress: Progress; today: string; onLine: (id: string) => void }) {
  const H = TOP + rows.length * ROW - ROW / 2 + 2;
  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-surface">
      <figcaption className="sr-only">Network map. Tap a line to ride it.</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block w-full max-w-2xl" role="img" aria-label="Every area as a metro line, with interchanges where terms on two lines are easily mixed up">
        <defs>
          {rows.map((l, row) => {
            const y = TOP + row * ROW;
            const c = colourOf(l.id);
            return (
              <g key={l.id}>
                {/* The line as a slim metal pipe: lit along the top, shaded underneath. */}
                <linearGradient id={`pipe-${l.id}`} gradientUnits="userSpaceOnUse" x1={0} x2={0} y1={y - PIPE / 2} y2={y + PIPE / 2}>
                  {PIPE_STOPS.map((st) => (
                    <stop key={st.at} offset={st.at} style={{ stopColor: shade(c, st.mix) }} />
                  ))}
                </linearGradient>
                {/* A met station as a metal bead, lit from the top left. */}
                <radialGradient id={`bead-${l.id}`} cx="0.5" cy="0.5" r="0.5" fx="0.34" fy="0.3">
                  <stop offset="0" style={{ stopColor: shade(c, 0.7) }} />
                  <stop offset="0.3" style={{ stopColor: shade(c, 0.15) }} />
                  <stop offset="0.55" style={{ stopColor: c }} />
                  <stop offset="1" style={{ stopColor: shade(c, -0.45) }} />
                </radialGradient>
              </g>
            );
          })}
        </defs>
        {rows.map((l, row) => {
          const y = TOP + row * ROW;
          const locked = l.units.every((u) => !unitOpen(progress, u.id));
          return (
            <g key={l.id} opacity={locked ? 0.3 : 1}>
              {/* The shadow the pipe casts on the page. */}
              <line x1={LEFT} x2={W - RIGHT} y1={y + 1.3} y2={y + 1.3} stroke="#000" strokeOpacity={0.16} strokeWidth={PIPE} strokeLinecap="round" />
              <line x1={LEFT} x2={W - RIGHT} y1={y} y2={y} stroke={`url(#pipe-${l.id})`} strokeWidth={PIPE} strokeLinecap="round" />
            </g>
          );
        })}
        {/* Interchanges: fine curves with a casing in the page colour, so where one crosses a line it reads as a bridge, not a stop. */}
        <g fill="none" strokeLinecap="round">
          {links.map((k) => {
            const d = connector(stations.get(k.a)!, stations.get(k.b)!);
            const width = Math.min(2, 1 + k.n / 10);
            return (
              <g key={`${k.a}|${k.b}`}>
                <path d={d} stroke={SURFACE} strokeWidth={width + 3} />
                <path d={d} stroke={INK} strokeWidth={width} strokeOpacity={0.28} />
              </g>
            );
          })}
        </g>
        {[...stations].map(([id, s]) => {
          const stops = lines.find((l) => l.id === s.line)!.stops.slice(s.from, s.to + 1);
          const st = unitStatus(progress, id, namedTerms(stops), today, stationCount(stops));
          const c = colourOf(s.line);
          const hub = linked.has(id);
          const filled = st === 'met' || st === 'due' || st === 'known';
          if (s.depot) {
            const d = 3.2;
            return <rect key={id} x={s.x - d} y={s.y - d} width={d * 2} height={d * 2} rx={0.8} transform={`rotate(45 ${s.x} ${s.y})`} fill={filled ? `url(#bead-${s.line})` : SURFACE} stroke={st === 'locked' ? INK3 : shade(c, -0.2)} strokeOpacity={st === 'locked' ? 0.5 : 1} strokeWidth={1.6} />;
          }
          const r = hub ? 4 : s.core ? 3.4 : 2.8;
          return (
            <g key={id}>
              {st === 'due' && <circle cx={s.x} cy={s.y} r={r + 2.4} fill="none" stroke="rgb(var(--amber))" strokeWidth={1.6} />}
              {/* An interchange is a bead with a fine dark rim; any other station a bead in its line's colour. */}
              <circle cx={s.x} cy={s.y + 0.8} r={r + 0.4} fill="#000" fillOpacity={0.14} />
              <circle cx={s.x} cy={s.y} r={r} fill={filled ? `url(#bead-${s.line})` : SURFACE} stroke={st === 'locked' ? INK3 : hub ? INK : shade(c, -0.2)} strokeOpacity={st === 'locked' ? 0.5 : 1} strokeWidth={hub ? 1.6 : 1.2} />
            </g>
          );
        })}
        {/* Each line is named above its left end, with a halo so links passing under stay readable. */}
        {rows.map((l, row) => {
          const locked = l.units.every((u) => !unitOpen(progress, u.id));
          return (
            <text key={l.id} x={LEFT - 1} y={TOP + row * ROW - 8} fontSize={9.5} fontWeight={700} letterSpacing={0.2} fill={colourOf(l.id)} stroke={SURFACE} strokeWidth={3} paintOrder="stroke" strokeLinejoin="round" opacity={locked ? 0.55 : 1}>
              {areas[l.id]?.short ?? l.name}
              {locked && (
                <tspan fill={INK3} fontWeight={500}>
                  {' '}
                  · opens later
                </tspan>
              )}
            </text>
          );
        })}
        {rows.map((l, row) => (
          <rect key={l.id} x={0} y={TOP + row * ROW - ROW / 2} width={W} height={ROW} fill="transparent" className="cursor-pointer" onClick={() => onLine(l.id)}>
            <title>{l.name}</title>
          </rect>
        ))}
      </svg>
      <p className="border-t border-line px-3 py-2 text-xs text-ink-3">Tap a line to ride it.</p>
    </figure>
  );
}
