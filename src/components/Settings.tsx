import { useRef, useState, type ReactNode } from 'react';
import type { AccountState, Me } from '../lib/account';
import { exportProgress, readBackupFile } from '../lib/storage';
import { newProgress } from '../lib/scheduler';
import { canSpeak, speak } from '../lib/speech';
import type { Progress } from '../lib/types';
import { AccountPanel } from './Account';
import { PasswordDialog } from './PasswordDialog';
import { Button, ConfirmDialog, Toggle } from './ui';
import type { SyncStatus } from './useAccount';

interface Props {
  progress: Progress;
  today: string;
  persisted: boolean;
  onChange: (p: Progress) => void;
  account: AccountState;
  sync: SyncStatus;
  onSignedIn: (me: Me) => void;
  onSignedOut: () => void;
  onSyncNow: () => void;
}

const NEW_OPTIONS = [5, 10, 15, 20, 30, 40];

export function Settings({ progress, today, persisted, onChange, account, sync, onSignedIn, onSignedOut, onSyncNow }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<Progress | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pasted, setPasted] = useState('');
  const [askPassword, setAskPassword] = useState(false);
  const s = progress.settings;
  const minutes = s.newPerDay;
  const signedIn = account.kind === 'in';
  const quantGranted = signedIn && account.me.quant;

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 pb-32 pt-5">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">Settings</h1>

      <Group title="Account">
        <AccountPanel account={account} sync={sync} onSignedIn={onSignedIn} onSignedOut={onSignedOut} onSyncNow={onSyncNow} />
      </Group>

      <Group title="Daily goal">
        <Row>
          <div className="w-full">
            <p className="font-bold text-ink" id="goal-label">
              New terms per day
            </p>
            <p className="mb-3 text-sm text-ink-3">
              {s.newPerDay} new terms is about {minutes} minutes a day, with reviews.
            </p>
            <div className="grid grid-cols-6 gap-1 rounded-xl bg-sunken p-1" role="radiogroup" aria-labelledby="goal-label">
              {NEW_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={s.newPerDay === n}
                  onClick={() => onChange({ ...progress, settings: { ...s, newPerDay: n } })}
                  className={`num rounded-lg py-2 text-sm font-extrabold transition ${s.newPerDay === n ? 'bg-surface text-brand-ink shadow-card' : 'text-ink-3 hover:text-ink-2'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </Row>
      </Group>

      <Group title="Quant track">
        <Row>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink">Go straight to quant</p>
            <p className="text-sm text-ink-3">
              Opens maths and probability, quant and risk, options, and microstructure, and puts them first on your path. {quantGranted ? 'Your account has access.' : 'Needs the password, or an account with quant access.'}
            </p>
          </div>
          <Toggle
            checked={!!s.quantFirst}
            onChange={(v) =>
              v
                ? quantGranted
                  ? onChange({ ...progress, settings: { ...s, quantFirst: true } })
                  : setAskPassword(true)
                : onChange({ ...progress, settings: { ...s, quantFirst: false } })
            }
            label="Go straight to quant"
          />
        </Row>
      </Group>

      <Group title="Sound">
        <Row>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink">Speaker buttons</p>
            <p className="text-sm text-ink-3">{canSpeak() ? 'Hear terms read aloud with your device’s voice.' : 'This browser has no built-in voice.'}</p>
          </div>
          <Toggle checked={s.voice} onChange={(v) => onChange({ ...progress, settings: { ...s, voice: v } })} label="Speaker buttons" />
        </Row>
        {s.voice && canSpeak() && (
          <Row>
            <button className="text-sm font-extrabold text-sky-ink" onClick={() => speak('Nifty fifty is up forty bips, and vega is bid.')}>
              Test the voice
            </button>
          </Row>
        )}
      </Group>

      <Group title="Your progress">
        <Row>
          <p className="text-sm leading-relaxed text-ink-2">
            Progress is saved in this browser on this device after every answer.{' '}
            {signedIn
              ? 'Your account also keeps a copy, so it follows you to every device you sign in on.'
              : 'Without an account it does not move to your other devices on its own, and clearing browser data erases it.'}
            {persisted ? ' This browser has agreed to keep it permanently.' : ''}
            <span className="mt-2 block text-ink-3">Last backup: {progress.lastBackup ?? 'never'}</span>
          </p>
        </Row>
        <Row>
          <div className="grid w-full grid-cols-2 gap-3">
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
        </Row>
        <Row>
          <button
            type="button"
            className="text-sm font-extrabold text-sky-ink"
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
          </button>
        </Row>
        <Row>
          <details className="w-full text-sm text-ink-2">
            <summary className="cursor-pointer font-extrabold text-sky-ink">Restore from copied text</summary>
            <label htmlFor="pasted-backup" className="mt-3 block text-ink-3">
              Paste the backup text here:
            </label>
            <textarea
              id="pasted-backup"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-line bg-sunken p-2 font-mono text-xs text-ink outline-none focus:border-sky"
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
        </Row>
        {message && (
          <Row>
            <p className="text-sm font-bold text-brand-ink" role="status">
              {message}
            </p>
          </Row>
        )}
      </Group>

      <Group title="Start over">
        <Row>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink">Reset progress</p>
            <p className="text-sm text-ink-3">{signedIn ? 'Erases all progress, on this device and your account. Settings are kept.' : 'Erases all progress on this device. Settings are kept.'}</p>
          </div>
          <Button variant="danger" className="!px-4 !py-2.5 text-sm" onClick={() => setConfirmReset(true)}>
            Reset
          </Button>
        </Row>
      </Group>

      {askPassword && (
        <PasswordDialog
          reason="The quant track is for learners who have the password."
          onCancel={() => setAskPassword(false)}
          onUnlock={() => {
            setAskPassword(false);
            onChange({ ...progress, settings: { ...s, quantFirst: true } });
            setMessage(null);
          }}
        />
      )}
      {pending && (
        <ConfirmDialog
          title="Replace your progress?"
          body={signedIn ? 'Your progress, here and on your account, will be replaced by the backup.' : 'The progress on this device will be replaced by the backup.'}
          confirmLabel="Replace"
          onConfirm={() => {
            onChange({ ...pending, epoch: Date.now() });
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
          body={signedIn ? 'This erases everything, on every device you sign in on, and cannot be undone.' : 'This erases everything on this device and cannot be undone.'}
          confirmLabel="Erase"
          danger
          onConfirm={() => {
            onChange({ ...newProgress(), settings: s, epoch: Date.now() });
            setConfirmReset(false);
            setMessage('Progress erased.');
          }}
          onCancel={() => setConfirmReset(false)}
        />
      )}

      <p className="px-1 text-xs leading-relaxed text-ink-3">
        FinTermShip is a learning tool, not investment advice. Facts that change, such as rules and tax rates, show the date they were last checked in the glossary.
      </p>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-[0.12em] text-ink-3">{title}</h2>
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">{children}</div>
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-4 px-4 py-4">{children}</div>;
}
