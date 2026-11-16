/**
 * A small burst of confetti from the middle of its parent, for a perfect lesson or a pass.
 * Pure CSS: each piece is thrown out along its own line, then falls and fades (the `burst`
 * keyframes). It plays once, takes no clicks, and is left out under reduced motion.
 */
import { reducedMotion } from '../lib/motion';

const COLOURS = ['--brand', '--good', '--amber', '--sky', '--violet'];
const PIECES = 18;

export function Confetti() {
  if (reducedMotion()) return null;
  return (
    <span className="pointer-events-none absolute left-1/2 top-1/2 z-10" aria-hidden="true">
      {Array.from({ length: PIECES }, (_, i) => {
        // Spread round the circle, a little uneven so it doesn't look stamped out.
        const angle = (i / PIECES) * Math.PI * 2 + (i % 3) * 0.17;
        const dist = 78 + ((i * 37) % 46);
        const x = Math.cos(angle) * dist;
        const y = Math.sin(angle) * dist * 0.8 - 26;
        const round = i % 4 === 0;
        return (
          <span
            key={i}
            className="absolute -ml-1 -mt-1 block animate-burst"
            style={
              {
                width: round ? 7 : 6,
                height: round ? 7 : 11,
                borderRadius: round ? 999 : 2,
                background: `rgb(var(${COLOURS[i % COLOURS.length]}))`,
                animationDelay: `${(i % 5) * 25}ms`,
                '--x': `${x.toFixed(0)}px`,
                '--y': `${y.toFixed(0)}px`,
                '--r': `${(i % 2 ? 1 : -1) * (180 + ((i * 53) % 260))}deg`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </span>
  );
}
