/** What Headline Desk and Finnections share on screen: the level meter and the not-yet-open screen. */
import { RISE_AFTER, access, levelState, type RoundMode } from '../../lib/modes/rounds';
import type { ModeId } from '../../lib/modes/ids';
import type { Progress } from '../../lib/types';
import { Button } from '../ui';

/** The level and the good rounds towards the next one. */
export function LevelMeter({ progress, mode }: { progress: Progress; mode: RoundMode }) {
  const s = levelState(progress, mode);
  const top = s.level >= 3;
  return (
    <span className="shrink-0 text-right text-xs font-bold text-ink-3" title={top ? 'The top level.' : `Two rounds in a row at 80% or better move you up a level.`}>
      Level
      <br />
      <span className="inline-flex items-center gap-1.5">
        <span className="num font-mono text-base text-ink">{s.level}</span>
        {!top && (
          <span className="flex gap-0.5" aria-label={`${s.good} of ${RISE_AFTER} good rounds towards level ${s.level + 1}`}>
            {Array.from({ length: RISE_AFTER }, (_, i) => (
              <span key={i} className={`h-1.5 w-3 rounded-sm ${i < s.good ? 'bg-good' : 'bg-ink/15'}`} />
            ))}
          </span>
        )}
      </span>
    </span>
  );
}

/** Shown in place of a round when the mode isn't open yet, or its content couldn't load. */
export function NotYet({ mode, error, onMode, onRetry }: { mode: RoundMode; error?: string; onMode: (m: ModeId) => void; onRetry?: () => void }) {
  const a = access(mode);
  return (
    <div className="rounded-3xl border border-dashed border-line px-6 py-10 text-center">
      <p className="font-display text-xl font-semibold text-ink">{error ? 'This didn’t load' : a.known ? 'Not open yet' : 'One moment'}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-2">
        {error ?? (a.known ? `Every round only uses terms you have met. Meet ${a.gap} more term${a.gap === 1 ? '' : 's'} in Path or Lines and the first round is ready.` : 'Checking which rounds you can play…')}
      </p>
      {(error || a.known) && (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {error && onRetry ? <Button onClick={onRetry}>Try again</Button> : <Button onClick={() => onMode('path')}>Go to Path</Button>}
        </div>
      )}
    </div>
  );
}
