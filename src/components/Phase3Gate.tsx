import { useState } from 'react';
import { TEST_PASS } from '../lib/choose';
import { canTakePhase3Test, PHASE3, PHASE3_TEST_SIZE, phase3Open } from '../lib/phase3';
import type { Progress } from '../lib/types';
import { Check, Lock } from './icons';
import { PasswordDialog } from './PasswordDialog';
import { Button } from './ui';

export const PHASE3_PASS_MARK = Math.ceil(PHASE3_TEST_SIZE * TEST_PASS);

interface Props {
  progress: Progress;
  today: string;
  onKey: () => void;
  onTest: () => void;
}

/** What phase 3 needs and the next step towards it. Shows nothing once phase 3 is open. */
export function Phase3Gate({ progress, today, onKey, onTest }: Props) {
  const [ask, setAsk] = useState(false);
  if (phase3Open(progress)) return null;
  const key = !!progress.phase3Key;
  const attempt = progress.tests?.[PHASE3];
  const testReady = canTakePhase3Test(progress, today);
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-sunken px-4 py-4 text-sm leading-relaxed text-ink-2">
      <p className="flex items-center gap-2 font-extrabold text-ink">
        <Lock className="h-4 w-4" /> Phase 3 is locked
      </p>
      <p>
        It needs the password and a readiness test: {PHASE3_TEST_SIZE} questions on options, futures, risk and backtesting, passed with {PHASE3_PASS_MARK} right.
      </p>
      <ol className="space-y-1.5" aria-label="Steps to open phase 3">
        <GateStep done={key} n={1}>
          Enter the password
        </GateStep>
        <GateStep done={false} n={2}>
          Pass the readiness test
        </GateStep>
      </ol>
      {attempt && !attempt.passed && (
        <p>
          Last test: {attempt.right} of {attempt.total} right.
          {attempt.date === today ? ' You can try again tomorrow.' : ''}
        </p>
      )}
      {!key ? (
        <Button className="w-full" onClick={() => setAsk(true)}>
          Enter the password
        </Button>
      ) : (
        testReady && (
          <Button className="w-full" onClick={onTest}>
            Take the readiness test ({PHASE3_TEST_SIZE} questions)
          </Button>
        )
      )}
      {ask && (
        <PasswordDialog
          reason="Phase 3, the trading strategies, is for learners who have the password."
          onCancel={() => setAsk(false)}
          onUnlock={() => {
            setAsk(false);
            onKey();
          }}
        />
      )}
    </div>
  );
}

function GateStep({ done, n, children }: { done: boolean; n: number; children: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <span
        className={`num flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${done ? 'bg-brand text-white' : 'border border-line bg-surface text-ink-3'}`}
        aria-hidden="true"
      >
        {done ? <Check className="h-3.5 w-3.5" /> : n}
      </span>
      <span className={done ? 'text-ink-3 line-through' : 'font-semibold text-ink'}>{children}</span>
      {done && <span className="sr-only">, done</span>}
    </li>
  );
}
