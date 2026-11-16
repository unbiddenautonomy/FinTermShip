import { useEffect, useState } from 'react';

/**
 * Small helpers for motion that CSS alone can't do. CSS animations are already cut short
 * for people who ask for reduced motion (index.css); these cover the parts run from script.
 */

/** Whether the learner's system asks for reduced motion. */
export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** A short tap of the phone's vibration, where there is one. Most desktops and iPhones ignore it. */
export function buzz(ms = 8) {
  try {
    if (!reducedMotion()) navigator.vibrate?.(ms);
  } catch {
    // Some browsers throw if vibration isn't allowed yet; it is only a nicety.
  }
}

/** A number that counts up from 0 to `to` when it first shows, easing out. Shows `to` at once under reduced motion. */
export function useCountUp(to: number, ms = 700, delay = 150): number {
  const [n, setN] = useState(() => (reducedMotion() ? to : 0));
  useEffect(() => {
    if (reducedMotion() || to === 0) {
      setN(to);
      return;
    }
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const k = Math.min(1, Math.max(0, (t - start - delay) / ms));
      setN(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms, delay]);
  return n;
}
