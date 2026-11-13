import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  adminDeleteInvite,
  adminInvite,
  adminList,
  adminSetMode,
  adminUpdate,
  changePassword,
  signIn,
  signOut,
  signUp,
  type AccountState,
  type AdminUser,
  type Invite,
  type Me,
} from '../lib/account';
import { Button, Toggle } from './ui';
import { dayKey, daysBetween } from '../lib/dates';
import type { SyncStatus } from './useAccount';
import { ALWAYS_ON, MODES } from '../lib/modes/ids';
import { MODE_INFO } from './modes/ModeBar';
import { useModeAccess } from './modes/modeAccess';

interface Props {
  account: AccountState;
  sync: SyncStatus;
  onSignedIn: (me: Me) => void;
  onSignedOut: () => void;
  onSyncNow: () => void;
}

const field = 'w-full rounded-xl border border-line bg-sunken px-3 py-2.5 text-ink outline-none focus:border-sky';

function syncText(sync: SyncStatus): string {
  if (sync.state === 'syncing') return 'Syncing…';
  if (sync.state === 'error') return sync.message;
  if (sync.state === 'ok') return `Synced at ${new Date(sync.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
  return 'Waiting to sync.';
}

/** The account block in Settings: sign in or join with an invite, then sync status and, for the admin, invites and access. */
export function AccountPanel({ account, sync, onSignedIn, onSignedOut, onSyncNow }: Props) {
  if (account.kind === 'loading') return <Row>Checking your account…</Row>;
  if (account.kind === 'off')
    return (
      <Row>
        <p className="text-sm leading-relaxed text-ink-2">Sign-in isn’t set up on this server yet, so progress stays on this device. Backups below still move it by hand.</p>
      </Row>
    );
  if (account.kind === 'offline')
    return (
      <Row>
        <p className="text-sm leading-relaxed text-ink-2">You seem to be offline. Progress is saved on this device and syncs when you’re back online and reopen the app.</p>
      </Row>
    );
  if (account.kind === 'out') return <SignIn onSignedIn={onSignedIn} />;
  return <SignedIn me={account.me} sync={sync} onSignedOut={onSignedOut} onSyncNow={onSyncNow} />;
}

function SignIn({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const [mode, setMode] = useState<'in' | 'join'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [invite, setInvite] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSignedIn(mode === 'in' ? await signIn(email, password) : await signUp(email, password, invite));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3 px-4 py-4" aria-label={mode === 'in' ? 'Sign in' : 'Join with an invite'}>
      <p className="text-sm leading-relaxed text-ink-2">
        {mode === 'in'
          ? 'Sign in to keep your progress in step across your phone and laptop. Progress on this device is kept and merged in.'
          : 'fintermship is invite-only. Use the code you were sent, with your email and a password of at least 8 characters.'}
      </p>
      <label className="block text-sm font-bold text-ink">
        Email
        <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={`${field} mt-1`} />
      </label>
      <label className="block text-sm font-bold text-ink">
        Password
        <input
          type="password"
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          required
          minLength={mode === 'join' ? 8 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`${field} mt-1`}
        />
      </label>
      {mode === 'join' && (
        <label className="block text-sm font-bold text-ink">
          Invite code
          <input autoComplete="off" value={invite} onChange={(e) => setInvite(e.target.value)} className={`${field} mt-1 font-mono uppercase`} placeholder="Leave empty if you’re the admin" />
        </label>
      )}
      {error && (
        <p className="text-sm font-bold text-bad-ink" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Create account'}
      </Button>
      <button
        type="button"
        className="text-sm font-extrabold text-sky-ink"
        onClick={() => {
          setMode(mode === 'in' ? 'join' : 'in');
          setError(null);
        }}
      >
        {mode === 'in' ? 'Have an invite? Create your account' : 'Already have an account? Sign in'}
      </button>
    </form>
  );
}

function SignedIn({ me, sync, onSignedOut, onSyncNow }: { me: Me; sync: SyncStatus; onSignedOut: () => void; onSyncNow: () => void }) {
  const [changing, setChanging] = useState(false);
  const access = [me.admin && 'admin', me.quant && 'quant track', me.phase3 && 'phase 3'].filter(Boolean).join(', ');
  return (
    <>
      <Row>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-ink">{me.email}</p>
          <p className="text-sm text-ink-3">{access ? `Access: ${access}.` : 'Access: the core course.'}</p>
          <p className={`mt-1 text-sm ${sync.state === 'error' ? 'font-bold text-bad-ink' : 'text-ink-3'}`} role="status">
            {syncText(sync)}
          </p>
        </div>
        <Button variant="secondary" className="!px-4 !py-2.5 text-sm" onClick={onSyncNow} disabled={sync.state === 'syncing'}>
          Sync now
        </Button>
      </Row>
      <Row>
        <div className="flex w-full flex-wrap gap-x-5 gap-y-2">
          <button type="button" className="text-sm font-extrabold text-sky-ink" onClick={() => setChanging(!changing)}>
            Change password
          </button>
          <button
            type="button"
            className="text-sm font-extrabold text-sky-ink"
            onClick={async () => {
              try {
                await signOut();
              } finally {
                onSignedOut();
                // The app's files are for signed-in sessions only, so leave for the sign-in page.
                window.location.assign('/');
              }
            }}
          >
            Sign out
          </button>
        </div>
      </Row>
      {changing && <ChangePassword onDone={() => setChanging(false)} />}
      {me.admin && <AdminPanel />}
    </>
  );
}

function ChangePassword({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-3 px-4 py-4"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await changePassword(current, next);
          onDone();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not change it.');
        }
      }}
    >
      <label className="block text-sm font-bold text-ink">
        Current password
        <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={`${field} mt-1`} />
      </label>
      <label className="block text-sm font-bold text-ink">
        New password
        <input type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} className={`${field} mt-1`} />
      </label>
      {error && (
        <p className="text-sm font-bold text-bad-ink" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="secondary" className="w-full">
        Change password
      </Button>
    </form>
  );
}

function AdminPanel() {
  const today = dayKey();
  const [data, setData] = useState<{ users: AdminUser[]; invites: Invite[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quant, setQuant] = useState(true);
  const [phase3, setPhase3] = useState(false);
  const [made, setMade] = useState<string | null>(null);
  const load = useCallback(() => {
    adminList()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load accounts.'));
  }, []);
  useEffect(load, [load]);
  const act = (p: Promise<unknown>) =>
    p.then(load).catch((e) => setError(e instanceof Error ? e.message : 'That didn’t work.'));
  const day = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return (
    <div className="space-y-4 px-4 py-4">
      <ModesForEveryone onError={setError} />
      <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-violet-ink">Admin: invites and access</p>
      <div className="space-y-3 rounded-xl bg-sunken p-3">
        <p className="text-sm font-bold text-ink">New invite</p>
        <Check label="Quant track" checked={quant} onChange={setQuant} />
        <Check label="Phase 3 (trading strategies)" checked={phase3} onChange={setPhase3} />
        <Button
          variant="secondary"
          className="w-full"
          onClick={() =>
            adminInvite(quant, phase3)
              .then((r) => {
                setMade(r.code);
                load();
              })
              .catch((e) => setError(e instanceof Error ? e.message : 'Could not make an invite.'))
          }
        >
          Make an invite code
        </Button>
        {made && (
          <p className="text-sm text-ink-2" role="status">
            Send this code: <span className="num select-all font-mono text-base font-extrabold tracking-wider text-ink">{made}</span>. It works once, for 14 days. They pick “Create
            your account” in Settings.
          </p>
        )}
      </div>
      {error && (
        <p className="text-sm font-bold text-bad-ink" role="alert">
          {error}
        </p>
      )}
      {data && data.invites.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-bold text-ink">Unused invites</p>
          <ul className="space-y-1.5">
            {data.invites.map((i) => (
              <li key={i.code} className="flex items-center gap-2 text-sm text-ink-2">
                <span className="num font-mono font-bold text-ink">{i.code}</span>
                <span className="flex-1 text-ink-3">
                  {[i.quant && 'quant', i.phase3 && 'phase 3'].filter(Boolean).join(', ') || 'core'} · until {day(i.expires)}
                </span>
                <button type="button" className="font-extrabold text-bad-ink" onClick={() => act(adminDeleteInvite(i.code))} aria-label={`Cancel invite ${i.code}`}>
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data && (
        <div>
          <p className="mb-1.5 text-sm font-bold text-ink">Accounts ({data.users.length})</p>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {data.users.map((u) => (
              <li key={u.id} className="space-y-2 p-3">
                <p className={`truncate text-sm font-bold ${u.disabled ? 'text-ink-3 line-through' : 'text-ink'}`}>
                  {u.email}
                  {u.admin ? ' · admin' : ''}
                </p>
                <ActivityLine a={u.activity} today={today} />
                {!u.admin && (
                  <div className="space-y-2">
                    <Switch label="Quant track" who={u.email} checked={!!u.quant} onChange={(v) => act(adminUpdate(u.id, { quant: v }))} />
                    <Switch label="Phase 3" who={u.email} checked={!!u.phase3} onChange={(v) => act(adminUpdate(u.id, { phase3: v }))} />
                    <Switch label="Can sign in" who={u.email} checked={!u.disabled} onChange={(v) => act(adminUpdate(u.id, { disabled: !v }))} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** One learner at a glance: when they last practised, their streak, and how far they've got. */
function ActivityLine({ a, today }: { a: AdminUser['activity']; today: string }) {
  if (!a || !a.lastDay) return <p className="text-xs text-ink-3">No practice synced yet.</p>;
  const ago = daysBetween(a.lastDay, today);
  const when = ago <= 0 ? 'today' : ago === 1 ? 'yesterday' : `${ago} days ago`;
  const streak = ago <= 1 ? a.streak : 0;
  const acc = a.right + a.wrong ? `${Math.round((a.right / (a.right + a.wrong)) * 100)}% right` : null;
  return (
    <div className="space-y-1 text-xs text-ink-2">
      <p>
        <span className={`font-bold ${ago > 7 ? 'text-bad-ink' : 'text-ink'}`}>Last practised {when}</span>
        {` · ${streak}-day streak · ${a.week} of the last 7 days`}
      </p>
      <p className="num text-ink-3">
        {[`${a.met} terms met`, `${a.known} known`, acc, `${a.passed} practice units passed`, `${a.xp} XP`].filter(Boolean).join(' · ')}
      </p>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--brand))]" />
      {label}
    </label>
  );
}

/** The admin's switches for the whole site: which modes everyone can use. */
function ModesForEveryone({ onError }: { onError: (message: string) => void }) {
  const { off, setOff } = useModeAccess();
  const [saving, setSaving] = useState<string | null>(null);
  const flip = (mode: string, on: boolean) => {
    setSaving(mode);
    adminSetMode(mode, on)
      .then((r) => setOff(r.modesOff))
      .catch((e) => onError(e instanceof Error ? e.message : 'Could not change that mode.'))
      .finally(() => setSaving(null));
  };
  return (
    <div className="space-y-2.5 rounded-xl bg-sunken p-3">
      <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-violet-ink">Admin: modes for everyone</p>
      <p className="text-sm text-ink-3">A mode switched off disappears for every learner, from the mode bar and the start screen. Their progress in it is kept. You still see it, marked off, so you can test it.</p>
      {MODES.map((m) => (
        <div key={m} className="flex items-center justify-between gap-3 text-sm text-ink-2">
          <span>
            <b className="text-ink">{MODE_INFO[m].label}</b>
            {saving === m && <span className="text-ink-3"> · saving…</span>}
          </span>
          {m === ALWAYS_ON ? (
            <span className="text-xs font-bold text-ink-3">Always on</span>
          ) : (
            <Toggle checked={!off.includes(m)} onChange={(v) => saving === null && flip(m, v)} label={`${MODE_INFO[m].label} for everyone`} />
          )}
        </div>
      ))}
    </div>
  );
}

function Switch({ label, who, checked, onChange }: { label: string; who: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-ink-2">
      <span>{label}</span>
      <Toggle checked={checked} onChange={onChange} label={`${label} for ${who}`} />
    </div>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-4 px-4 py-4 text-sm text-ink-2">{children}</div>;
}
