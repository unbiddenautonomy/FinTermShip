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
import type { Progress } from '../../lib/types';

/** Links with at least this many mixed-up pairs are drawn; every interchange is still listed on each line. */
const MAP_MIN_LINK = 6;

const W = 360;
const LEFT = 10;
const RIGHT = 14;
const ROW = 46;
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

/** A transit-style connector: straight down (or up) the map, then a 45° run into the other station. */
function connector(a: Station, b: Station): string {
  const [p, q] = a.y < b.y ? [a, b] : [b, a];
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const run = Math.min(Math.abs(dx), dy - 8);
  return `M${p.x},${p.y} L${p.x},${q.y - run} L${q.x},${q.y}`;
}

const colourOf = (id: string) => areas[id]?.colour ?? '#777';

export function NetworkMap({ progress, today, onLine }: { progress: Progress; today: string; onLine: (id: string) => void }) {
  const H = TOP + rows.length * ROW - ROW / 2 + 2;
  return (
    <figure className="-mx-4 overflow-hidden border-y-2 border-[#111] bg-white text-[#111] sm:mx-0 sm:rounded-xl sm:border-2">
      <figcaption className="flex items-baseline justify-between bg-[#111] px-4 py-2 text-white">
        <span className="text-sm font-extrabold tracking-wide">Network map</span>
        <span className="text-xs text-white/70">Tap a line to ride it</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Every area as a metro line, with interchanges where terms on two lines are easily mixed up">
        {rows.map((l, row) => {
          const y = TOP + row * ROW;
          const locked = l.units.every((u) => !unitOpen(progress, u.id));
          return (
            <g key={l.id} opacity={locked ? 0.4 : 1}>
              <line x1={LEFT} x2={W - RIGHT} y1={y} y2={y} stroke={colourOf(l.id)} strokeWidth={6} strokeLinecap="round" strokeDasharray={l.phase === 3 && locked ? '10 6' : undefined} />
            </g>
          );
        })}
        {/* Each interchange gets a white casing, so where it crosses another line it reads as a bridge, not a stop. */}
        <g fill="none" strokeLinejoin="round" strokeLinecap="round">
          {links.map((k) => {
            const d = connector(stations.get(k.a)!, stations.get(k.b)!);
            const width = Math.min(4, 1.5 + k.n / 5);
            return (
              <g key={`${k.a}|${k.b}`}>
                <path d={d} stroke="#fff" strokeWidth={width + 4} />
                <path d={d} stroke="#111" strokeWidth={width} strokeOpacity={0.45} />
              </g>
            );
          })}
        </g>
        {[...stations].map(([id, s]) => {
          const stops = lines.find((l) => l.id === s.line)!.stops.slice(s.from, s.to + 1);
          const st = unitStatus(progress, id, namedTerms(stops), today, stationCount(stops));
          const c = colourOf(s.line);
          const hub = linked.has(id);
          const r = hub ? 6 : s.core ? 5 : 4;
          if (s.depot) return <rect key={id} x={s.x - 4.5} y={s.y - 4.5} width={9} height={9} transform={`rotate(45 ${s.x} ${s.y})`} fill={st === 'known' || st === 'met' ? c : '#fff'} stroke={c} strokeWidth={2.5} />;
          return (
            <g key={id}>
              {st === 'due' && <circle cx={s.x} cy={s.y} r={r + 3.5} fill="none" stroke="#D4932F" strokeWidth={2.5} />}
              <circle cx={s.x} cy={s.y} r={r} fill={st === 'met' || st === 'due' || st === 'known' ? c : '#fff'} stroke={st === 'locked' ? '#A3A3A3' : hub ? '#111' : c} strokeWidth={hub ? 3 : 2.5} strokeDasharray={st === 'locked' ? '2 2' : undefined} />
              {st === 'known' && <path d={`M${s.x - r * 0.45},${s.y + r * 0.05} l${r * 0.3},${r * 0.32} l${r * 0.6},${r * -0.66}`} fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />}
            </g>
          );
        })}
        {/* Each line is named in words above its left end, with a halo so links passing under stay readable. */}
        {rows.map((l, row) => {
          const locked = l.units.every((u) => !unitOpen(progress, u.id));
          return (
            <text key={l.id} x={LEFT - 2} y={TOP + row * ROW - 9} fontSize={11} fontWeight={800} fill={colourOf(l.id)} stroke="#fff" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round" opacity={locked ? 0.6 : 1}>
              {areas[l.id]?.short ?? l.name}
              {locked && <tspan fill="#777" fontWeight={600}> · locked</tspan>}
            </text>
          );
        })}
        {rows.map((l, row) => (
          <rect key={l.id} x={0} y={TOP + row * ROW - ROW / 2} width={W} height={ROW} fill="transparent" className="cursor-pointer" onClick={() => onLine(l.id)}>
            <title>{l.name}</title>
          </rect>
        ))}
      </svg>
    </figure>
  );
}
