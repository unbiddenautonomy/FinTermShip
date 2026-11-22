/**
 * The seasonal theme: a light look that changes with the date. Each season or
 * festival has a window, and when two windows overlap the one higher in SEASONS
 * wins. Festivals take their whole week (Navratri its nine nights and Dussehra).
 *
 * Seasons follow the northern calendar: spring March to May, autumn September to
 * November, winter December to February. Summer has no look of its own, so F1
 * (whose season runs roughly March to early December) fills June to August, and
 * the Olympics take over while the Summer Games are on.
 *
 * Hindu festivals follow the lunar calendar, so their dates are listed per year
 * below. A year missing from a table just skips that festival; extend the tables
 * before 2031.
 */

export type SeasonId =
  | 'diwali'
  | 'holi'
  | 'navratri'
  | 'christmas'
  | 'spring'
  | 'halloween'
  | 'autumn'
  | 'winter'
  | 'olympics'
  | 'f1';

/** Highest priority first. */
export const SEASONS: { id: SeasonId; label: string }[] = [
  { id: 'diwali', label: 'Diwali' },
  { id: 'holi', label: 'Holi' },
  { id: 'navratri', label: 'Navratri' },
  { id: 'christmas', label: 'Christmas' },
  { id: 'spring', label: 'Spring' },
  { id: 'halloween', label: 'Halloween' },
  { id: 'autumn', label: 'Autumn' },
  { id: 'winter', label: 'Winter' },
  { id: 'olympics', label: 'Olympics' },
  { id: 'f1', label: 'F1' },
];

export const SEASON_IDS: readonly string[] = SEASONS.map((s) => s.id);

/** Lakshmi Puja, the main day of Diwali. */
const DIWALI: Record<number, string> = {
  2025: '2025-10-20',
  2026: '2026-11-08',
  2027: '2027-10-29',
  2028: '2028-10-17',
  2029: '2029-11-05',
  2030: '2030-10-26',
};

/** The day of colours (Dhulandi), the day after Holika Dahan. */
const HOLI: Record<number, string> = {
  2025: '2025-03-14',
  2026: '2026-03-04',
  2027: '2027-03-22',
  2028: '2028-03-11',
  2029: '2029-03-01',
  2030: '2030-03-20',
};

/** Sharad Navratri: the first night, and Dussehra (Vijayadashami) at the end. */
const NAVRATRI: Record<number, [string, string]> = {
  2025: ['2025-09-22', '2025-10-02'],
  2026: ['2026-10-11', '2026-10-20'],
  2027: ['2027-09-30', '2027-10-09'],
  2028: ['2028-09-18', '2028-09-27'],
  2029: ['2029-10-07', '2029-10-16'],
  2030: ['2030-09-27', '2030-10-06'],
};

/** Summer Olympic Games (the Winter Games fall inside winter, which ranks higher). */
const OLYMPICS: Record<number, [string, string]> = {
  2028: ['2028-07-14', '2028-07-30'],
  2032: ['2032-07-23', '2032-08-08'],
};

type Window = [number, number];

/** Days since 1970 for a YYYY-MM-DD string, ignoring time zones. */
function dayNum(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

const md = (y: number, m: number, d: number): number => Math.round(Date.UTC(y, m - 1, d) / 86_400_000);

/** The week around a festival's main day: three days either side. */
const week = (iso: string | undefined): Window | null => (iso ? [dayNum(iso) - 3, dayNum(iso) + 3] : null);
const span = (pair: [string, string] | undefined): Window | null => (pair ? [dayNum(pair[0]), dayNum(pair[1])] : null);

/** Every window for a season that could touch year y (winter crosses New Year). */
function windows(id: SeasonId, y: number): Window[] {
  const out: (Window | null)[] = [];
  switch (id) {
    case 'diwali':
      out.push(week(DIWALI[y]));
      break;
    case 'holi':
      out.push(week(HOLI[y]));
      break;
    case 'navratri':
      out.push(span(NAVRATRI[y]));
      break;
    case 'christmas':
      out.push([md(y, 12, 22), md(y, 12, 28)]);
      break;
    case 'spring':
      out.push([md(y, 3, 1), md(y, 5, 31)]);
      break;
    case 'halloween':
      // The week leading up to it: Halloween is over once 31 October ends.
      out.push([md(y, 10, 25), md(y, 10, 31)]);
      break;
    case 'autumn':
      out.push([md(y, 9, 1), md(y, 11, 30)]);
      break;
    case 'winter':
      out.push([md(y, 1, 1), md(y, 3, 1) - 1], [md(y, 12, 1), md(y, 12, 31)]);
      break;
    case 'olympics':
      out.push(span(OLYMPICS[y]));
      break;
    case 'f1':
      out.push([md(y, 3, 1), md(y, 12, 10)]);
      break;
  }
  return out.filter((w): w is Window => w !== null);
}

/** The season on a given day (the device's local date), or null if none applies. */
export function seasonFor(date: Date = new Date()): SeasonId | null {
  const y = date.getFullYear();
  const today = md(y, date.getMonth() + 1, date.getDate());
  for (const s of SEASONS) {
    if (windows(s.id, y).some(([a, b]) => today >= a && today <= b)) return s.id;
  }
  return null;
}

/** What the small badge by the name says while a season is on. */
const GREETINGS: Record<SeasonId, string> = {
  diwali: 'Happy Diwali',
  holi: 'Happy Holi',
  navratri: 'Happy Navratri',
  christmas: 'Merry Christmas',
  spring: 'Spring',
  halloween: 'Happy Halloween',
  autumn: 'Autumn',
  winter: 'Winter',
  olympics: 'Olympics',
  f1: 'Race season',
};

export function seasonGreeting(id: SeasonId): string {
  return GREETINGS[id];
}

export function seasonLabel(id: SeasonId | null): string {
  return SEASONS.find((s) => s.id === id)?.label ?? 'Plain white';
}
