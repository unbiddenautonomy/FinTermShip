import { useEffect } from 'react';

/**
 * Keyboard play for the game, case and mock screens, which share no single
 * component: 1 to 9 press the matching answer (buttons marked data-key="choice"),
 * and Enter presses the next step (data-key="next", or else the first primary
 * button). Lessons and drills have their own keys and don't use this.
 */
export function useGameKeys(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target) || document.querySelector('[role="dialog"]')) return;
      if (/^[1-9]$/.test(e.key)) {
        const choices = usable('[data-key="choice"]');
        const el = choices[Number(e.key) - 1];
        if (el) {
          e.preventDefault();
          el.click();
        }
      } else if (e.key === 'Enter') {
        // A focused button or link already answers Enter by itself.
        if (e.target instanceof HTMLElement && e.target.closest('button, a')) return;
        const el = usable('[data-key="next"]')[0] ?? usable('[data-variant="primary"]')[0];
        if (el) {
          e.preventDefault();
          el.click();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}

/** "/" opens search from anywhere outside a text box. */
export function useSlashKey(onSlash: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      onSlash();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSlash]);
}

export function isTyping(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

function usable(selector: string): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(selector)].filter(
    (el) => !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0,
  );
}
