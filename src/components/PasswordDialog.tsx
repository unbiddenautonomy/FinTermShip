import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { checkPassword } from '../lib/gate';
import { Button } from './ui';

/**
 * Asks for the password that opens the gated parts of the app: the quant switch and phase 3.
 * Rendered into the page body, so it sits above any sheet it was opened from.
 */
export function PasswordDialog({ reason, onUnlock, onCancel }: { reason: string; onUnlock: () => void; onCancel: () => void }) {
  const [value, setValue] = useState('');
  const [wrong, setWrong] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (checkPassword(value)) onUnlock();
    else setWrong(true);
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
            setWrong(false);
          }}
          aria-label="Password"
          aria-invalid={wrong}
          className={`mt-4 w-full rounded-xl border-2 bg-sunken px-4 py-3 text-lg text-ink outline-none focus:border-sky ${wrong ? 'border-bad' : 'border-line'}`}
        />
        {wrong && (
          <p className="mt-2 text-sm font-bold text-bad-ink" role="alert">
            That password isn't right.
          </p>
        )}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={!value.trim()}>
            Unlock
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
