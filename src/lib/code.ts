/**
 * Code reading: short Python and pandas snippets a quant analyst reads every
 * day. Some ask what the code prints; the rest hide a classic research bug
 * (look-ahead, survivorship, a wrong annualisation) to spot. Every printed
 * answer was checked by running the snippet.
 */
import items from '../data/code.json';
import { shuffle, type Rng } from './questions';

export interface CodeItem {
  id: string;
  kind: 'output' | 'bug';
  title: string;
  code: string;
  ask: string;
  /** The right option first. */
  options: string[];
  why: string;
}

export const CODE_ITEMS = items as CodeItem[];

export const CODE = {
  outputs: 6,
  bugs: 4,
  passRight: 8,
};
export const CODE_COUNT = CODE.outputs + CODE.bugs;

export interface CodeQuestion {
  item: CodeItem;
  options: string[];
  answer: number;
}

/** Six snippets to read and four bugs to spot, in a mixed order, with the options shuffled. */
export function newCodeRound(rng: Rng): CodeQuestion[] {
  const outputs = shuffle(
    CODE_ITEMS.filter((i) => i.kind === 'output'),
    rng,
  ).slice(0, CODE.outputs);
  const bugs = shuffle(
    CODE_ITEMS.filter((i) => i.kind === 'bug'),
    rng,
  ).slice(0, CODE.bugs);
  return shuffle([...outputs, ...bugs], rng).map((item) => {
    const order = shuffle([0, 1, 2, 3], rng);
    return { item, options: order.map((k) => item.options[k]), answer: order.indexOf(0) };
  });
}

export const codePassed = (right: number) => right >= CODE.passRight;
