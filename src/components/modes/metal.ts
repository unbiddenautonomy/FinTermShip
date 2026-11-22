/**
 * Term Lines' polished-metal finish for rails, rings and stations.
 *
 * Polished metal in a line's colour: a bright sheen along one edge, the colour through the middle
 * and a darker edge opposite, like a brushed metal tube. `dir` is the way across the rail: 180deg
 * for a horizontal bar, 90deg for a vertical rail.
 */
export const metal = (colour: string, dir = '180deg') =>
  `linear-gradient(${dir}, rgb(255 255 255 / 0.55) 0%, rgb(255 255 255 / 0.18) 35%, rgb(255 255 255 / 0) 55%, rgb(0 0 0 / 0.22) 100%), ${colour}`;
/** A ring of polished metal: light catching the top left, shade at the bottom right. */
export const metalRing = (colour: string) =>
  `conic-gradient(from 200deg, color-mix(in srgb, ${colour} 45%, white), ${colour} 25%, color-mix(in srgb, ${colour} 70%, black) 55%, ${colour} 80%, color-mix(in srgb, ${colour} 45%, white))`;
/** A soft glow under a rail, in its own colour. */
export const glow = (colour: string) => `0 1px 3px color-mix(in srgb, ${colour} 45%, transparent)`;
/** Cuts a rail into dashes while keeping its finish. */
export const dashMask = (dir: string) => {
  const m = `repeating-linear-gradient(${dir}, #000 0 7px, transparent 7px 12px)`;
  return { maskImage: m, WebkitMaskImage: m };
};
