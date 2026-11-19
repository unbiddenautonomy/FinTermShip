/**
 * Keeps the address bar and the browser's history in step with the screen on show, so Back and
 * Forward move between screens and a refresh lands where the learner was (src/components/route.ts).
 *
 * One rule runs both ways: the address is whatever `pathOf` makes of the place. When the screen
 * changes the address is written to match, and when the learner presses Back the place is read
 * from the address. Neither step can loop, because after it the two already agree.
 */
import { useEffect, useRef } from 'react';
import { isDealtPath, pathOf, placeAt, sameEntry, type Place } from './route';

/** The address showing now, path and query. */
const here = () => window.location.pathname + window.location.search;

export function useHistory(place: Place | null, go: (place: Place, y: number) => void, leave: () => void) {
  const onPop = useRef(go);
  const onLeave = useRef(leave);
  onPop.current = go;
  onLeave.current = leave;
  /** Set once the first screen has claimed the entry the app opened on. */
  const started = useRef(false);
  /**
   * How far down the learner had scrolled, kept as it happens. Reading it when the screen changes
   * would be too late: the new screen has already been put at the top by then.
   */
  const scrolled = useRef(0);
  /** The address a lesson was started from, so leaving it can drop the entry it took. */
  const dealtFrom = useRef<string | null>(null);
  useEffect(() => {
    const onScroll = () => {
      scrolled.current = window.scrollY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!place) return;
    const path = pathOf(place);
    const at = here();
    if (isDealtPath(path) && !isDealtPath(at)) dealtFrom.current = at;
    // The first screen takes the entry the app was opened on, so Back still leaves the app.
    if (!started.current) {
      started.current = true;
      if (at !== path) window.history.replaceState({}, '', path);
      return;
    }
    if (at === path) return;
    // A lesson's address can't be returned to, so its entry is given up rather than kept. Going
    // back to the screen it was started from drops that entry; anywhere else writes over it, so
    // Back can't land on the lesson again either way.
    if (isDealtPath(at)) {
      // A lesson into its own results stays on the one entry.
      if (isDealtPath(path)) {
        window.history.replaceState(window.history.state, '', path);
        return;
      }
      const from = dealtFrom.current;
      dealtFrom.current = null;
      // Back to the screen the lesson was started from: give the entry up, so one Back press
      // from there moves. Anywhere else writes over it, so Back can't land on the lesson again.
      if (from === path) window.history.back();
      else window.history.replaceState(window.history.state, '', path);
      return;
    }
    if (sameEntry(at, path)) {
      window.history.replaceState(window.history.state, '', path);
      return;
    }
    // How far down the screen being left was, so Back puts the learner back where they were.
    window.history.replaceState({ y: scrolled.current }, '', at);
    window.history.pushState({}, '', path);
    scrolled.current = 0;
  }, [place]);

  useEffect(() => {
    const popped = () => {
      const to = placeAt(here());
      // An address that names no screen (a dealt one, or one typed by hand): show the usual first screen.
      if (to) onPop.current(to, typeof window.history.state?.y === 'number' ? window.history.state.y : 0);
      else onLeave.current();
    };
    window.addEventListener('popstate', popped);
    return () => window.removeEventListener('popstate', popped);
  }, []);
}
