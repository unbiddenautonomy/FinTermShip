/**
 * Signal lab: tune a signal in sample, then see the truth behind it.
 *
 * Most items are a grid of in-sample Sharpe ratios over 25 settings of one
 * signal (lookback by entry level). Some signals are pure noise, some have a
 * real edge on a broad patch of settings, and some have that edge plus one lone
 * setting that got lucky. Take one setting live or bin the signal; the lab then
 * shows each setting's true Sharpe. The rest ask how high luck alone reaches
 * after many tries (the idea behind the deflated Sharpe ratio), and how fast a
 * signal's edge decays.
 *
 * Grids are drawn so that a careful player can always get them right: noise
 * never beats what luck gives, and a real edge always beats it clearly.
 */
import { normal } from './guess';
import { shuffle, type Rng } from './questions';

export const SIGNAL = {
  items: 8,
  passRight: 6,
  grids: 5,
  /** A pick counts when its true Sharpe is at least this share of the best true Sharpe. */
  keep: 0.7,
};

export const LOOKBACKS = [5, 10, 20, 40, 60];
export const ENTRIES = [0.5, 1, 1.5, 2, 2.5];
const N = LOOKBACKS.length;
const CELLS = N * ENTRIES.length;

/** Rounded expected best of n tries in standard errors, the figures the rules teach. */
export const LUCK_TABLE: Record<number, number> = { 10: 1.5, 20: 1.9, 50: 2.2, 100: 2.5, 1000: 3.2 };

const SQRT2PI = Math.sqrt(2 * Math.PI);
const pdf = (x: number) => Math.exp((-x * x) / 2) / SQRT2PI;

/** Standard normal CDF (Abramowitz and Stegun 7.1.26, good to about 1e-7). */
export function cdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Expected largest of n independent standard normal draws. */
export function expectedMax(n: number): number {
  let s = 0;
  const h = 0.005;
  for (let x = -8; x <= 8; x += h) s += x * n * pdf(x) * cdf(x) ** (n - 1) * h;
  return s;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** About the best Sharpe luck alone reaches with this many tries: one standard error of an annual Sharpe is about 1 ÷ √years. */
export const luckBest = (tries: number, years: number) => round1(expectedMax(tries) / Math.sqrt(years));

const MAX25 = expectedMax(CELLS);

export type GridType = 'noise' | 'plateau' | 'spike';

export interface GridItem {
  kind: 'grid';
  type: GridType;
  name: string;
  years: number;
  /** Rows are lookbacks, columns are entry levels; rounded to one decimal, as shown. */
  inSample: number[][];
  truth: number[][];
  /** The best in-sample Sharpe that 25 settings of pure noise would reach over these years. */
  luck: number;
}

export interface LuckItem {
  kind: 'luck';
  tries: number;
  years: number;
  /** The best Sharpe the researcher found, for the story. */
  found: number;
  options: number[];
  answer: number;
}

export interface DecayItem {
  kind: 'decay';
  /** Information coefficient by days of delay, from 0. */
  ic: number[];
  halfLife: number;
  options: number[];
  answer: number;
}

export type SignalItem = GridItem | LuckItem | DecayItem;
export type GridChoice = { row: number; col: number } | 'bin';

const NAMES = [
  'Short-term reversal, Nifty 100 stocks',
  'Volume spike signal',
  'Earnings revision momentum',
  'Delivery percentage signal',
  'FPI flow signal',
  'Open interest build-up signal',
  'Gap fade on Nifty futures',
  'Sector momentum',
  'Analyst upgrade drift',
  'Put-call ratio signal',
];

/** Noise that neighbouring settings share, as they share most of their trades. Each cell has unit variance. */
function noiseField(rng: Rng): number[][] {
  const raw = Array.from({ length: N }, () => Array.from({ length: N }, () => normal(rng)));
  return raw.map((row, i) =>
    row.map((v, j) => {
      const nb = [raw[i - 1]?.[j], raw[i + 1]?.[j], raw[i]?.[j - 1], raw[i]?.[j + 1]].filter((x): x is number => x !== undefined);
      return (v + 0.5 * nb.reduce((a, b) => a + b, 0)) / Math.sqrt(1 + 0.25 * nb.length);
    }),
  );
}

const flat = (g: number[][]) => g.flat();
const maxOf = (g: number[][]) => Math.max(...flat(g));

/** Each cell's average with its neighbours: the patch around a setting. */
export function patchMeans(g: number[][]): number[][] {
  return g.map((row, i) =>
    row.map((_, j) => {
      const vals: number[] = [];
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) if (g[i + di]?.[j + dj] !== undefined) vals.push(g[i + di][j + dj]);
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    }),
  );
}

function argmax(g: number[][]): { row: number; col: number } {
  let best = { row: 0, col: 0 };
  g.forEach((row, i) => row.forEach((v, j) => v > g[best.row][best.col] && (best = { row: i, col: j })));
  return best;
}

/** Whether a setting is a good pick: its true Sharpe is close to the best true Sharpe. */
export const isGood = (item: GridItem, row: number, col: number) => {
  const top = maxOf(item.truth);
  return top > 0 && item.truth[row][col] >= SIGNAL.keep * top - 1e-9;
};

export function gridRight(item: GridItem, choice: GridChoice): boolean {
  if (choice === 'bin') return item.type === 'noise';
  return item.type !== 'noise' && isGood(item, choice.row, choice.col);
}

/** How a careful researcher plays a grid: bin it if the best is no better than luck, else take the centre of the strongest patch. */
export function carefulChoice(item: GridItem): GridChoice {
  if (maxOf(item.inSample) <= item.luck) return 'bin';
  return argmax(patchMeans(item.inSample));
}

export function makeGrid(type: GridType, name: string, rng: Rng): GridItem {
  for (;;) {
    const years = [4, 5, 6, 8][Math.floor(rng() * 4)];
    const se = 1 / Math.sqrt(years);
    const luck = round1(MAX25 * se);
    const noise = noiseField(rng);
    let truth: number[][];
    let inSample: number[][];
    if (type === 'noise') {
      truth = noise.map((row) => row.map(() => 0));
      inSample = noise.map((row) => row.map((v) => round1(v * se)));
    } else {
      const top = luck + 0.4 + 0.4 * rng();
      const w = 1.2 + 0.4 * rng();
      const ci = Math.floor(rng() * N);
      const cj = Math.floor(rng() * N);
      truth = noise.map((row, i) => row.map((_, j) => round1(top * Math.exp(-((i - ci) ** 2 + (j - cj) ** 2) / (2 * w * w)))));
      inSample = noise.map((row, i) => row.map((v, j) => round1(truth[i][j] + 0.5 * se * v)));
      if (type === 'spike') {
        // One far-off setting that got lucky: weak in truth, the best of all in sample.
        const far = flat(truth)
          .map((t, k) => ({ t, row: Math.floor(k / N), col: k % N }))
          .filter((c) => c.t < 0.3 * top && Math.abs(c.row - ci) + Math.abs(c.col - cj) >= 3);
        if (!far.length) continue;
        const s = far[Math.floor(rng() * far.length)];
        inSample[s.row][s.col] = round1(maxOf(inSample) + 0.4 + 0.3 * rng());
      }
    }
    const item: GridItem = { kind: 'grid', type, name, years, inSample, truth, luck };
    const best = maxOf(inSample);
    const top = argmax(inSample);
    if (type === 'noise') {
      // Tempting, but no better than luck.
      if (best > luck - 0.1 || best < 0.5 * luck) continue;
    } else {
      if (best < luck + 0.3) continue;
      const pick = carefulChoice(item);
      if (pick === 'bin' || !isGood(item, pick.row, pick.col)) continue;
      // A plateau's best in-sample cell is a fair pick; a spike's is the trap.
      if (type === 'plateau' && !isGood(item, top.row, top.col)) continue;
      if (type === 'spike' && isGood(item, top.row, top.col)) continue;
    }
    return item;
  }
}

/** Four answers in rising order, the right one somewhere among them. */
const SPREADS = [
  [1, 1.6, 2.4, 3.5],
  [0.5, 1, 1.6, 2.4],
  [0.35, 0.6, 1, 1.6],
  [0.25, 0.45, 0.7, 1],
];

export function makeLuck(rng: Rng): LuckItem {
  const tries = [10, 20, 50, 100, 1000][Math.floor(rng() * 5)];
  const years = [1, 4, 9, 16][Math.floor(rng() * 4)];
  const value = round1(LUCK_TABLE[tries] / Math.sqrt(years));
  for (;;) {
    const spread = SPREADS[Math.floor(rng() * SPREADS.length)];
    const options = spread.map((m) => round1(value * m));
    if (new Set(options).size < 4 || options[0] <= 0) continue;
    const found = round1(value * (rng() < 0.6 ? 0.9 + 0.3 * rng() : 1.8 + 0.6 * rng()));
    return { kind: 'luck', tries, years, found, options, answer: spread.indexOf(1) };
  }
}

export function makeDecay(rng: Rng): DecayItem {
  const halfLife = 1 + Math.floor(rng() * 5);
  const ic0 = 0.05 + 0.04 * rng();
  const ic = Array.from({ length: 11 }, (_, k) => ic0 * 0.5 ** (k / halfLife));
  const start = halfLife === 1 ? 1 : halfLife === 5 ? 2 : rng() < 0.5 ? 1 : 2;
  const options = [start, start + 1, start + 2, start + 3];
  return { kind: 'decay', ic, halfLife, options, answer: options.indexOf(halfLife) };
}

/** The two grids added to one of each kind. No kind comes three times, so always binning or always taking the top cell can't pass. */
const EXTRA: GridType[][] = [
  ['noise', 'spike'],
  ['noise', 'plateau'],
  ['plateau', 'spike'],
  ['spike', 'spike'],
];

/** Five grids (at least one of each kind), two luck questions and one on decay. A grid comes first. */
export function newSignalRound(rng: Rng): SignalItem[] {
  const types = shuffle<GridType>(['noise', 'plateau', 'spike', ...EXTRA[Math.floor(rng() * EXTRA.length)]], rng);
  const names = shuffle(NAMES, rng);
  const grids = types.map((t, i) => makeGrid(t, names[i], rng));
  const rest = shuffle<SignalItem>([...grids.slice(1), makeLuck(rng), makeLuck(rng), makeDecay(rng)], rng);
  return [grids[0], ...rest];
}

export const signalPassed = (right: number) => right >= SIGNAL.passRight;

export const fmtSharpe = (x: number) => (x < 0 ? '−' : '') + Math.abs(x).toFixed(1);
