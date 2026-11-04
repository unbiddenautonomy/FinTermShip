import { useRef, useState } from 'react';
import { exportProgress, readBackupFile } from '../lib/storage';
import { newProgress } from '../lib/scheduler';
import { canSpeak, speak } from '../lib/speech';
import type { Progress } from '../lib/types';
import { Button, Card, ConfirmDialog } from './ui';

interface Props {
  progress: Progress;
  today: string;
  persisted: boolean;
  onChange: (p: Progress) => void;
  onBack: () => void;
}

const NEW_OPTIONS = [5, 10, 15, 20, 30, 40];

export function Settings({ progress, today, persisted, onChange, onBack }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<Progress | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pasted, setPasted] = useState('');
  const s = progress.settings;

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 pb-16 pt-6">
      <div className="mb-2 flex items-center gap-3">
        <button onClick={onBack} className="rounded-lg px-2 py-1 font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
          ← Back
        </button>
        <h1 className="text-2xl font-black text-slate-800 dark:text-white">Settings</h1>
      </div>

      <Card>
        <label className="block font-bold text-slate-800 dark:text-slate-100" htmlFor="newPerDay">
          New terms per day
        </label>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">20 is about 20 minutes a day with reviews.</p>
        <div className="flex flex-wrap gap-2" id="newPerDay">
          {NEW_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => onChange({ ...progress, settings: { ...s, newPerDay: n } })}
              className={`rounded-xl border-2 px-4 py-2 font-bold ${s.newPerDay === n ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-[#05291a] dark:text-brand-400' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}
            >
              {n}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-bold text-slate-800 dark:text-slate-100">Speaker buttons</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {canSpeak() ? 'Hear terms read aloud with your device’s voice.' : 'This browser has no built-in voice.'}
            </p>
          </div>
          <input
            type="checkbox"
            className="h-6 w-6 accent-brand-500"
            checked={s.voice}
            onChange={(e) => onChange({ ...progress, settings: { ...s, voice: e.target.checked } })}
            aria-label="Speaker buttons"
          />
        </div>
        {s.voice && canSpeak() && (
          <button className="mt-3 text-sm font-bold text-sky-600 underline dark:text-sky-400" onClick={() => speak('Nifty fifty is up forty bips')}>
            Test the voice
          </button>
        )}
      </Card>

      <Card className="space-y-3">
        <p className="font-bold text-slate-800 dark:text-slate-100">Your progress</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Progress is saved in this browser on this device, after every answer. It does not move to your other devices on its own, and clearing browser data erases it.
          {persisted ? ' This browser has agreed to keep it permanently.' : ''}
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400">Last backup: {progress.lastBackup ?? 'never'}</p>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              exportProgress(progress, today);
              onChange({ ...progress, lastBackup: today });
              setMessage('Backup file saved. Keep it somewhere safe, such as your email or cloud drive.');
            }}
          >
            Save backup
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            Load backup
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              setPending(await readBackupFile(file));
            } catch (err) {
              setMessage(err instanceof Error ? err.message : 'Could not read that file.');
            }
          }}
        />
        <Button
          variant="ghost"
          className="w-full !px-0 text-sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(JSON.stringify(progress));
              onChange({ ...progress, lastBackup: today });
              setMessage('Backup copied. Paste it into a note or email to yourself.');
            } catch {
              setMessage('This browser blocked copying. Use Save backup instead.');
            }
          }}
        >
          Copy backup as text instead
        </Button>
        <details className="text-sm text-slate-600 dark:text-slate-300">
          <summary className="cursor-pointer font-semibold">Restore from copied text</summary>
          <label htmlFor="pasted-backup" className="mt-2 block">
            Paste the backup text here:
          </label>
          <textarea
            id="pasted-backup"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-xl border-2 border-slate-200 bg-white p-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
          />
          <Button
            variant="secondary"
            className="mt-2"
            disabled={!pasted.trim()}
            onClick={async () => {
              try {
                setPending(await readBackupFile(new File([pasted], 'backup.json')));
              } catch {
                setMessage('That text is not a FinTermShip backup.');
              }
            }}
          >
            Restore
          </Button>
        </details>
        {message && <p className="text-sm font-semibold text-brand-700 dark:text-brand-400">{message}</p>}
      </Card>

      <Card>
        <p className="font-bold text-slate-800 dark:text-slate-100">Start over</p>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Erases all progress on this device.</p>
        <Button
          variant="danger"
          onClick={() => setConfirmReset(true)}
        >
          Reset progress
        </Button>
      </Card>

      {pending && (
        <ConfirmDialog
          title="Replace your progress?"
          body="The progress on this device will be replaced by the backup."
          confirmLabel="Replace"
          onConfirm={() => {
            onChange(pending);
            setPending(null);
            setPasted('');
            setMessage('Backup loaded.');
          }}
          onCancel={() => setPending(null)}
        />
      )}
      {confirmReset && (
        <ConfirmDialog
          title="Erase all progress?"
          body="This erases everything on this device and cannot be undone."
          confirmLabel="Erase"
          danger
          onConfirm={() => {
            onChange({ ...newProgress(), settings: s });
            setConfirmReset(false);
            setMessage('Progress erased.');
          }}
          onCancel={() => setConfirmReset(false)}
        />
      )}

      <p className="px-1 text-xs text-slate-400">
        FinTermShip is a learning tool, not investment advice. Facts that change, such as rules and tax rates, show the date they were last checked in the glossary.
      </p>
    </div>
  );
}
