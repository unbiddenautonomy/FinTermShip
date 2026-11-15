import { afterEach, describe, expect, it } from 'vitest';
import skeleton from '../data/skeleton.json';
import { buildCards } from './cardData';
import { areaCoreSize, areaCoreTermIds, areaOpen, canTakeTest, focusActive, focusLeft, focusQueue, settleFocus, unitOpen, withFocus } from './choose';
import { addTerms, applyCards, areaSize, categories, clearTerms, path, termById, termIdsOfUnit, unitSize } from './content';
import { todayStatus } from './lesson';
import { areaKpis, kpis } from './modes/knowledge';
import { reachableCount, reachableTermIds, withPhase3Key } from './phase3';
import { graduate, introduce, newProgress } from './scheduler';
import { areaStats } from './stats';
import { allStubs } from './syllabus';
import { currentUnit, track, unitDone } from './track';
import { frontier, lineById, lines, namedTerms, rideRoute, stationCount } from './modes/plans';
import { interchangesAt } from './modes/transfer';
import type { Progress } from './types';

const today = '2026-11-13';
const cards = Object.fromEntries(buildCards());

// Each test may leave only some terms known; put the whole syllabus back after it.
afterEach(() => {
  clearTerms();
  addTerms(allStubs);
  applyCards(cards);
});

function meet(p: Progress, ids: string[]): Progress {
  for (const id of ids) p = graduate(introduce(p, id, '2026-11-01'), id, '2026-11-02');
  return p;
}

/** Everything the app works out from progress, for comparing the app (met terms only) with the Worker (every term). */
function seen(p: Progress) {
  return {
    current: currentUnit(p, today),
    done: track(p).map((r) => unitDone(p, r)),
    open: path.map((r) => unitOpen(p, r.unit.id)),
    areas: categories.map((c) => [areaOpen(p, c.id), canTakeTest(p, c.id, today), areaCoreSize(c.id)]),
    focus: [focusActive(p), ...path.map((r) => focusLeft(p, r.unit.id))],
    settled: settleFocus(p).focus ?? null,
    status: todayStatus(p, today),
    reach: reachableCount(p),
    kpis: kpis(p, today),
    areaKpis: areaKpis(p, today),
    areaStats: areaStats(p, today),
  };
}

const ids = path.flatMap((r) => termIdsOfUnit(r.unit.id));
const progresses: [string, Progress][] = [
  ['new', newProgress()],
  ['a few terms', meet(newProgress(), ids.slice(0, 7))],
  ['the core sweep half done', meet(newProgress(), ids.filter((_, i) => i % 3 !== 0).slice(0, 300))],
  ['a pick part way through', withFocus(meet(newProgress(), ids.slice(0, 40)), path.find((r) => r.pass === 2 && unitSize(r.unit.id) > 2)!.unit.id)],
  ['quant first', { ...meet(newProgress(), ids.slice(0, 60)), settings: { ...newProgress().settings, quantFirst: true } }],
  ['an area tested out', { ...meet(newProgress(), ids.slice(0, 30)), unlocked: ['options'] }],
  ['everything but phase 3', meet(newProgress(), ids.filter((id) => !path.find((r) => r.pass === 3 && r.terms.some((t) => t.id === id))))],
  ['phase 3 open', withPhase3Key(meet(newProgress(), ids.slice(0, 500)))],
];

describe('the app with only the terms it has been given', () => {
  it('ships units and their sizes, and no term', () => {
    const text = JSON.stringify(skeleton);
    // A term id as a value (a key such as "order" is the skeleton's own), or a term's name in quotes.
    const quoted = (x: string) => new RegExp(`${JSON.stringify(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!:)`, 'i').test(text);
    // A few units and games share a term's name (the Arbitrage unit, the VWAP game): those are the skeleton's own.
    const own = new Set(categories.flatMap((c) => c.units.flatMap((u) => [u.name, u.game ?? ''])).map((x) => x.toLowerCase()));
    for (const s of allStubs) for (const x of [s.id, s.term]) if (!own.has(x.toLowerCase())) expect(quoted(x), x).toBe(false);
    for (const c of categories) for (const u of c.units) expect(unitSize(u.id), u.id).toBe(termIdsOfUnit(u.id).length);
    expect(categories.reduce((n, c) => n + areaSize(c.id), 0)).toBe(allStubs.length);
  });

  it('counts what the Worker lists', () => {
    for (const [name, p] of progresses) {
      expect(reachableCount(p).total, name).toBe(reachableTermIds(p).length);
      for (const r of path) expect(focusLeft(p, r.unit.id), `${name}: ${r.unit.id}`).toBe(focusQueue(p, r.unit.id).length);
      for (const c of categories) expect(areaCoreSize(c.id)).toBe(areaCoreTermIds(c.id).length);
    }
  });

  it('works out the path, its locks, its counts and the KPIs the same from met terms alone', () => {
    for (const [name, p] of progresses) {
      const full = seen(p);
      clearTerms();
      addTerms(allStubs.filter((s) => p.terms[s.id]));
      expect(termById.size, name).toBe(Object.keys(p.terms).length);
      expect(seen(p), name).toEqual(full);
      clearTerms();
      addTerms(allStubs);
    }
  });

  it('keeps teaching order and takes new mix-ups as terms arrive', () => {
    clearTerms();
    const unit = path.find((r) => unitSize(r.unit.id) >= 4)!.unit.id;
    const inUnit = allStubs.filter((s) => s.unit === unit);
    addTerms([inUnit[2], inUnit[0]].map((s) => ({ ...s, confusables: [] })));
    addTerms([inUnit[1]]);
    expect(termIdsOfUnit(unit)).toEqual(inUnit.slice(0, 3).map((s) => s.id));
    addTerms([{ ...inUnit[0], confusables: [inUnit[1].id] }]);
    expect(termById.get(inUnit[0].id)!.confusables).toEqual([inUnit[1].id]);
  });

  it('draws every station on Term Lines, naming only the terms it has been given', () => {
    const everyStation = lines.map((l) => stationCount(l.stops));
    const named = new Map(lines.map((l) => [l.id, namedTerms(l.stops)]));
    clearTerms();
    expect(lines.map((l) => stationCount(l.stops))).toEqual(everyStation);
    expect(lines.flatMap((l) => namedTerms(l.stops))).toEqual([]);
    // A new learner rides on from the first station without its name.
    const p = newProgress();
    expect(frontier(p, 'basics')).toBe(0);
    const route = rideRoute(p, 'basics', 0)!;
    expect(route.newIds).toEqual([]);
    expect(route.unnamed).toBeGreaterThan(0);
    // Given a few terms, each lands on its own station, and interchanges only join known terms.
    const basics = named.get('basics')!.slice(0, 3);
    addTerms(allStubs.filter((s) => basics.includes(s.id)));
    const line = lineById.get('basics')!;
    expect(basics.map((id) => line.stops.findIndex((s) => 'term' in s && s.term === id))).toEqual([0, 1, 2]);
    for (const id of basics) for (const o of interchangesAt(id)) expect(termById.has(o)).toBe(true);
    clearTerms();
    addTerms(allStubs);
    expect(new Map(lines.map((l) => [l.id, namedTerms(l.stops)]))).toEqual(named);
  });
});
