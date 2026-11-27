/**
 * Term Lines' finish: every rail is a slim metal pipe in its line's colour, and every station a
 * small metal bead on it. Light comes from the top left, so a pipe has a dark underside, the
 * colour through the body, a bright highlight near the lit edge and a soft shadow under it.
 */

/** The pipe's shading across its width, from the lit edge (0) to the shaded edge (1). Shared with the network map's SVG. */
export const PIPE_STOPS: { at: number; mix: number }[] = [
  // mix > 0 blends in white by that share, mix < 0 blends in black.
  { at: 0, mix: -0.25 },
  { at: 0.16, mix: 0.1 },
  { at: 0.3, mix: 0.62 },
  { at: 0.42, mix: 0.12 },
  { at: 0.7, mix: -0.1 },
  { at: 1, mix: -0.45 },
];

/** A line's colour with white (mix > 0) or black (mix < 0) blended in. */
export const shade = (colour: string, mix: number) =>
  mix === 0 ? colour : `color-mix(in srgb, ${colour} ${Math.round((1 - Math.abs(mix)) * 100)}%, ${mix > 0 ? 'white' : 'black'})`;

/**
 * A pipe in a line's colour. `dir` points from the lit edge across to the shaded one: 180deg for
 * a horizontal pipe (lit along the top), 90deg for a vertical one (lit along the left).
 */
export const metal = (colour: string, dir = '180deg') => `linear-gradient(${dir}, ${PIPE_STOPS.map((s) => `${shade(colour, s.mix)} ${s.at * 100}%`).join(', ')})`;

/** A metal bead: a sphere lit from the top left. */
export const bead = (colour: string) => `radial-gradient(circle at 34% 30%, ${shade(colour, 0.7)} 0%, ${shade(colour, 0.15)} 28%, ${colour} 52%, ${shade(colour, -0.45)} 100%)`;

/** A ring of metal, like a pipe bent into a circle: light catching the top left, shade at the bottom right. */
export const metalRing = (colour: string) =>
  `conic-gradient(from 225deg, ${shade(colour, 0.55)}, ${colour} 22%, ${shade(colour, -0.45)} 50%, ${colour} 78%, ${shade(colour, 0.55)})`;

/** The soft shadow a pipe or bead casts on the page below it. */
export const PIPE_SHADOW = '0 1.5px 2px rgb(0 0 0 / 0.22)';

/** Cuts a rail into dashes while keeping its finish. */
export const dashMask = (dir: string) => {
  const m = `repeating-linear-gradient(${dir}, #000 0 7px, transparent 7px 12px)`;
  return { maskImage: m, WebkitMaskImage: m };
};
