import { useState } from 'react';
import { cleanName, NAME_MAX, ROLES } from '../lib/profile';
import type { Progress } from '../lib/types';
import { Button } from './ui';

const field = 'mt-1 w-full rounded-xl border border-line bg-sunken px-3 py-2.5 text-ink outline-none focus:border-sky';

/**
 * Name and target role. Shown once on the home screen
 * (with a skip), and always editable in Settings.
 */
export function AboutYou({ progress, onSave, onSkip, saveLabel = 'Save' }: { progress: Progress; onSave: (p: Progress) => void; onSkip?: () => void; saveLabel?: string }) {
  const s = progress.settings;
  const [name, setName] = useState(s.name ?? '');
  const [target, setTarget] = useState(s.target ?? '');
  const [saved, setSaved] = useState(false);
  const save = () => {
    const settings = { ...s, aboutAsked: true, name: cleanName(name) || undefined, target: target || undefined, interviewDate: undefined };
    onSave({ ...progress, settings });
    setSaved(true);
  };
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onChange={() => setSaved(false)}
    >
      <label className="block text-sm font-bold text-ink">
        What should we call you?
        <input value={name} maxLength={NAME_MAX} autoComplete="given-name" onChange={(e) => setName(e.target.value)} className={field} placeholder="Your first name" />
      </label>
      <label className="block text-sm font-bold text-ink">
        What are you preparing for?
        <select value={target} onChange={(e) => setTarget(e.target.value)} className={field}>
          <option value="">Not sure yet, just learning</option>
          {ROLES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
      </label>
      <div className={`grid gap-3 ${onSkip ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {onSkip && (
          <Button variant="secondary" onClick={onSkip}>
            Skip
          </Button>
        )}
        <Button type="submit">{saved && !onSkip ? 'Saved' : saveLabel}</Button>
      </div>
    </form>
  );
}
