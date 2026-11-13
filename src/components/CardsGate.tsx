import type { CardsStatus } from '../lib/cards';
import { Button } from './ui';

/** What shows until this account's term cards are here, or why they aren't. */
export function CardsGate({ status, onRetry }: { status: CardsStatus; onRetry: () => void }) {
  const box = (title: string, body: string, action?: { label: string; onClick: () => void }) => (
    <div className="flex min-h-[100dvh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-3 text-center">
        <p className="text-lg font-extrabold text-ink">{title}</p>
        <p className="text-sm leading-relaxed text-ink-2">{body}</p>
        {action && (
          <Button className="w-full" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
  if (status === 'loading') return <div className="flex min-h-[100dvh] items-center justify-center text-ink-3">Loading…</div>;
  if (status === 'signed-out') return box('Your session has ended', 'Sign in again to carry on. Your progress is saved.', { label: 'Sign in', onClick: () => window.location.assign('/') });
  if (status === 'offline') return box('You’re offline', 'fintermship needs a connection the first time it opens on a device. Try again once you’re back online.', { label: 'Try again', onClick: onRetry });
  return box('Your terms didn’t load', 'Something went wrong fetching them. Your progress is safe.', { label: 'Try again', onClick: onRetry });
}

/** A short line at the bottom of the screen: fetching a lesson's cards, or why a lesson didn't start. */
export function CardsToast({ fetching, notice, onClose }: { fetching: boolean; notice: string | null; onClose: () => void }) {
  if (!fetching && !notice) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4" role="status" aria-live="polite">
      <div className="pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-surface shadow-sheet">
        <span className="flex-1">{fetching ? 'Getting your terms…' : notice}</span>
        {!fetching && (
          <button type="button" className="font-extrabold underline" onClick={onClose}>
            OK
          </button>
        )}
      </div>
    </div>
  );
}
