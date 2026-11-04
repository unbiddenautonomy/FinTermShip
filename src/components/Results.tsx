import { termName } from '../lib/content';
import type { LessonSummary } from './Lesson';
import { Button, Card } from './ui';

export function Results({ summary, canContinue, onHome, onNext }: { summary: LessonSummary; canContinue: boolean; onHome: () => void; onNext: () => void }) {
  const pct = summary.firstTryTotal ? Math.round((summary.firstTryCorrect / summary.firstTryTotal) * 100) : 100;
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-xl flex-col px-4 pb-10 pt-10">
      <h1 className="text-center text-3xl font-black text-brand-600 dark:text-brand-400">Lesson complete</h1>
      <div className="mt-8 grid grid-cols-2 gap-3">
        <Card className="text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-sky-600 dark:text-sky-400">XP earned</p>
          <p className="mt-1 text-3xl font-black text-slate-800 dark:text-white">+{summary.xp}</p>
        </Card>
        <Card className="text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-brand-600 dark:text-brand-400">Accuracy</p>
          <p className="mt-1 text-3xl font-black text-slate-800 dark:text-white">{pct}%</p>
        </Card>
      </div>
      {summary.newIds.length > 0 && (
        <Card className="mt-4">
          <p className="mb-2 font-bold text-slate-800 dark:text-slate-100">New terms</p>
          <p className="text-slate-600 dark:text-slate-300">{summary.newIds.map(termName).join(', ')}</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">They come back for review tomorrow.</p>
        </Card>
      )}
      {summary.missedIds.length > 0 && (
        <Card className="mt-4">
          <p className="mb-2 font-bold text-slate-800 dark:text-slate-100">Terms to watch</p>
          <p className="text-slate-600 dark:text-slate-300">{summary.missedIds.map(termName).join(', ')}</p>
        </Card>
      )}
      <div className="mt-auto space-y-3 pt-8">
        {canContinue && (
          <Button onClick={onNext} className="w-full text-lg">
            Next lesson
          </Button>
        )}
        <Button variant={canContinue ? 'secondary' : 'primary'} onClick={onHome} className="w-full">
          Back to home
        </Button>
      </div>
    </div>
  );
}
