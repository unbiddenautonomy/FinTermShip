/** The modes, by id. Kept apart from the knowledge layer so the Worker can use it without the content. */
export type ModeId = 'path' | 'lines' | 'callit' | 'exchange' | 'headline' | 'finnections';
export const MODES: ModeId[] = ['path', 'lines', 'callit', 'exchange', 'headline', 'finnections'];
/** Path is the spine of the app (lessons, drills, tests), so it can't be switched off. */
export const ALWAYS_ON: ModeId = 'path';

export const isModeId = (x: unknown): x is ModeId => typeof x === 'string' && (MODES as string[]).includes(x);

/** The modes a learner can use, given the ones the admin switched off for everyone. */
export function modesOn(off: readonly string[]): ModeId[] {
  return MODES.filter((m) => m === ALWAYS_ON || !off.includes(m));
}
