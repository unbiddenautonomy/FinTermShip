import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { unlock } from '../lib/account';
import { Button } from './ui';

/**
 * Asks for the password that opens the gated parts of the app: the quant switch and phase 3.
 * The server checks it (the app holds no copy) and opens both on the account.
 * Rendered into the page body, so it sits above any sheet it was opened from.
 */
export function PasswordDialog({ reason, onUnlock, onCancel }: { reason: string; onUnlock: () => void; onCancel: () => void }) {
  const [value, setValue] = useState('');
  const [wrong, setWrong] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // `npm run dev` has no server to ask.
    if (import.meta.env.DEV) return onUnlock();
    setBusy(true);
    try {
      await unlock(value);
      onUnlock();
    } catch (err) {
      setWrong(err instanceof Error ? err.message : 'That password isn’t right.');
    } finally {
      setBusy(false);
    }
  };
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 p-4 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="password-title"
    >
      <form onSubmit={submit} className="w-full max-w-sm animate-pop rounded-3xl bg-surface p-6 shadow-xl">
        <p id="password-title" className="text-lg font-extrabold text-ink">
          Enter the password
        </p>
        <p className="mt-2 leading-relaxed text-ink-2">{reason}</p>
        <input
          type="password"
          autoFocus
          autoComplete="off"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setWrong(null);
          }}
          aria-label="Password"
          aria-invalid={!!wrong}
          className={`mt-4 w-full rounded-xl border-2 bg-sunken px-4 py-3 text-lg text-ink outline-none focus:border-sky ${wrong ? 'border-bad' : 'border-line'}`}
        />
        {wrong && (
          <p className="mt-2 text-sm font-bold text-bad-ink" role="alert">
            {wrong}
          </p>
        )}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={!value.trim() || busy}>
            Unlock
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
