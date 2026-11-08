import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { areaOpen, canTakeTest, unitOpen } from '../lib/choose';
import { caseById, categories, categoryOfUnit, isPracticeUnit, practiceKind, termById, termIdsOfUnit, unitById } from '../lib/content';
import { drillPassed } from '../lib/drills';
import { answer, careers, replyFor, STARTERS, type HelpAction, type Intent, type Reply, type Target } from '../lib/guide';
import { todayStatus } from '../lib/lesson';
import { KIND_LABEL } from '../lib/practice';
import { currentUnit } from '../lib/track';
import type { Progress } from '../lib/types';
import { ChatIcon, Lock } from './icons';
import { Pill, TermDetails } from './ui';

export interface GuideEntry {
  id: number;
  from: 'you' | 'guide';
  text?: string;
  reply?: Reply;
}

interface Props {
  progress: Progress;
  today: string;
  log: GuideEntry[];
  onLog: (log: GuideEntry[]) => void;
  onOpenUnit: (unitId: string) => void;
  onFocus: (unitId: string) => void;
  onTest: (categoryId: string) => void;
  onStart: () => void;
  onGo: (where: HelpAction, query?: string) => void;
}

/** A chat box that answers from the app's own content. No AI model: see lib/guide.ts. */
export function Guide({ progress, today, log, onLog, onOpenUnit, onFocus, onTest, onStart, onGo }: Props) {
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const nextId = () => (log.length ? log[log.length - 1].id + 1 : 1);

  // After a question, show it at the top with its answer below; otherwise show the latest message.
  // A frame's wait lets the app's own scroll-to-top on a tab change go first.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const asked = log.length >= 2 && log[log.length - 1].from === 'guide' && log[log.length - 2].from === 'you';
      const mine = list.current?.querySelectorAll('[data-you]');
      if (asked && mine?.length) mine[mine.length - 1].scrollIntoView({ block: 'start' });
      else end.current?.scrollIntoView({ block: 'end' });
    });
    return () => cancelAnimationFrame(id);
  }, [log]);

  const say = (you: string, reply: Reply) => {
    const id = nextId();
    onLog([...log, { id, from: 'you', text: you }, { id: id + 1, from: 'guide', reply }]);
  };
  const send = (e?: FormEvent) => {
    e?.preventDefault();
    const q = text.trim();
    if (!q) return;
    say(q, answer(q, progress));
    setText('');
  };
  const act: Actions = {
    ask: (label, target, intent) => say(label, replyFor(target, intent, progress)),
    pick: (unitId) => {
      onFocus(unitId);
      const id = nextId();
      onLog([...log, { id, from: 'guide', reply: { kind: 'text', text: `${unitById.get(unitId)?.name} is now your pick. Your next lesson on Learn starts it.`, action: 'home' } }]);
    },
    openUnit: onOpenUnit,
    test: onTest,
    start: onStart,
    go: onGo,
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col px-4 pb-44 pt-5">
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Guide</h1>
        <p className="mt-1 text-sm text-ink-3">Answers from this app's own lessons, cases and settings. No AI model, so ask about terms, topics or the app.</p>
      </div>

      <div ref={list} className="space-y-4" aria-live="polite">
        <Bubble>
          <p>Ask me what a term means, what to learn next, or how the app works. I'll point you to the right unit.</p>
          {log.length === 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <Chip key={s} onClick={() => say(s, answer(s, progress))}>
                  {s}
                </Chip>
              ))}
            </div>
          )}
        </Bubble>
        {log.map((m) =>
          m.from === 'you' ? (
            <p key={m.id} data-you className="ml-auto w-fit max-w-[85%] scroll-mt-4 rounded-2xl rounded-br-md bg-brand px-4 py-2.5 font-semibold text-white">
              {m.text}
            </p>
          ) : (
            <Bubble key={m.id}>{m.reply && <ReplyView reply={m.reply} progress={progress} today={today} act={act} />}</Bubble>
          ),
        )}
        <div ref={end} className="scroll-mb-44" />
      </div>

      <form onSubmit={send} className="above-tabs fixed inset-x-0 z-20 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask about a term or topic"
            aria-label="Ask the guide"
            enterKeyHint="send"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none placeholder:text-ink-3 focus:border-sky"
          />
          <button type="submit" disabled={!text.trim()} className="rounded-2xl bg-brand px-4 font-extrabold text-white transition disabled:bg-line disabled:text-ink-3">
            Ask
          </button>
        </div>
      </form>
    </div>
  );
}

interface Actions {
  ask: (label: string, target: Target, intent: Intent) => void;
  pick: (unitId: string) => void;
  openUnit: (unitId: string) => void;
  test: (categoryId: string) => void;
  start: () => void;
  go: (where: HelpAction, query?: string) => void;
}

function Bubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-soft text-violet-ink">
        <ChatIcon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-line bg-surface px-4 py-3 leading-relaxed text-ink-2 shadow-card">{children}</div>
    </div>
  );
}

function Chip({ children, onClick, tone = 'line' }: { children: ReactNode; onClick: () => void; tone?: 'line' | 'brand' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-2 text-left text-sm font-extrabold transition ${tone === 'brand' ? 'bg-brand text-white hover:brightness-105' : 'border border-line bg-surface text-ink hover:bg-sunken'}`}
    >
      {children}
    </button>
  );
}

const GO_LABEL: Record<HelpAction, string> = { settings: 'Open Settings', careers: 'Open the career map', glossary: 'Open the Glossary', home: 'Go to Learn' };

function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-3 flex flex-wrap gap-2">{children}</div>;
}

/** The locked-unit line and a test button, shared by term, unit and area replies. */
function LockNote({ categoryId, progress, today, act }: { categoryId: string; progress: Progress; today: string; act: Actions }) {
  const area = categories.find((c) => c.id === categoryId)!;
  const testable = canTakeTest(progress, categoryId, today);
  return (
    <>
      <p className="mt-2 flex items-start gap-1.5 text-sm text-ink-3">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Advanced units in {area.name} open once you've met its core terms{testable ? ', or when you pass its test' : progress.tests?.[categoryId]?.date === today ? '. You tried its test today, so try again tomorrow' : ''}.
        </span>
      </p>
      {testable && (
        <Actions>
          <Chip tone="brand" onClick={() => act.test(categoryId)}>
            Take the {area.name} test
          </Chip>
        </Actions>
      )}
    </>
  );
}

function unitSummary(p: Progress, unitId: string): string {
  const kind = practiceKind(unitId);
  if (kind) {
    const passed = drillPassed(p, unitId);
    const size = kind === 'case' ? `${caseById.get(unitId)?.steps.length ?? 0} decisions, ` : '';
    return `A ${KIND_LABEL[kind]}, ${size}${passed ? 'passed' : 'not passed yet'}`;
  }
  const ids = termIdsOfUnit(unitId);
  return `${ids.length} terms, ${ids.filter((id) => p.terms[id]).length} met`;
}

function ReplyView({ reply, progress: p, today, act }: { reply: Reply; progress: Progress; today: string; act: Actions }) {
  switch (reply.kind) {
    case 'text':
      return (
        <>
          <p>{reply.text}</p>
          {reply.action && (
            <Actions>
              <Chip onClick={() => act.go(reply.action!)}>{GO_LABEL[reply.action]}</Chip>
            </Actions>
          )}
        </>
      );
    case 'help':
      return (
        <>
          <p>{reply.topic.text}</p>
          {reply.topic.action && (
            <Actions>
              <Chip onClick={() => act.go(reply.topic.action!)}>{GO_LABEL[reply.topic.action]}</Chip>
            </Actions>
          )}
        </>
      );
    case 'none':
      return (
        <>
          <p>I couldn't match that to anything in the app. Try a term ("theta"), a topic ("order types"), or "where do I start".</p>
          {reply.query && (
            <Actions>
              <Chip onClick={() => act.go('glossary', reply.query)}>Search the Glossary</Chip>
            </Actions>
          )}
        </>
      );
    case 'choices':
      return (
        <>
          <p>{reply.options.length > 1 ? 'Did you mean one of these?' : 'Did you mean this?'}</p>
          <Actions>
            {reply.options.map((o) => (
              <Chip key={`${o.target.kind}:${o.target.id}`} onClick={() => act.ask(o.label, o.target, reply.intent)}>
                {o.label}
              </Chip>
            ))}
          </Actions>
        </>
      );
    case 'locked3':
      return (
        <>
          <p>
            <b className="text-ink">{reply.name}</b> is in phase 3, trading strategies. It opens at the end of the path with the password and a readiness test, so I'll keep its details until then.
          </p>
          <Actions>
            <Chip onClick={() => act.openUnit(reply.unitId)}>How to open phase 3</Chip>
          </Actions>
        </>
      );
    case 'route':
      return <RouteView p={p} today={today} act={act} />;
    case 'careers':
      return (
        <>
          <p>{careers.intro}</p>
          <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-sm">
            {careers.rounds.map((r) => (
              <li key={r.name}>{r.name}</li>
            ))}
          </ol>
          <p className="mt-2 text-sm text-ink-3">Name a role, such as "quant researcher", and I'll list the units that prepare for it.</p>
          <Actions>
            <Chip tone="brand" onClick={() => act.go('careers')}>
              Open the career map
            </Chip>
          </Actions>
        </>
      );
    case 'role': {
      const role = careers.roles.find((r) => r.id === reply.roleId)!;
      return (
        <>
          <p className="font-extrabold text-ink">{role.title}</p>
          <p className="text-sm text-ink-3">{role.where}</p>
          <p className="mt-2">{role.what}</p>
          <p className="mt-3 text-sm font-bold text-ink">Units that prepare for it</p>
          <Actions>
            {role.practise.map((id) => (
              <Chip key={id} onClick={() => act.openUnit(id)}>
                {unitById.get(id)?.name}
              </Chip>
            ))}
          </Actions>
          <Actions>
            <Chip onClick={() => act.go('careers')}>Open the career map</Chip>
          </Actions>
        </>
      );
    }
    case 'compare':
      return (
        <>
          <p>Side by side:</p>
          <div className="mt-2 space-y-3">
            {reply.termIds.map((id) => {
              const t = termById.get(id)!;
              return (
                <div key={id} className="rounded-xl bg-sunken/60 p-3">
                  <p className="font-extrabold text-ink">{t.term}</p>
                  <p className="mt-1 text-[15px]">{t.definition}</p>
                </div>
              );
            })}
          </div>
        </>
      );
    case 'term':
      return <TermView termId={reply.termId} p={p} today={today} act={act} />;
    case 'unit':
      return <UnitView unitId={reply.unitId} termId={reply.termId} p={p} today={today} act={act} />;
    case 'area':
      return <AreaView categoryId={reply.categoryId} intent={reply.intent} p={p} today={today} act={act} />;
  }
}

function TermView({ termId, p, today, act }: { termId: string; p: Progress; today: string; act: Actions }) {
  const t = termById.get(termId)!;
  const unit = unitById.get(t.unit)!;
  const s = p.terms[termId];
  const open = unitOpen(p, t.unit);
  return (
    <>
      <p className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-lg font-extrabold text-ink">{t.term}</span>
        {s ? <Pill tone={s.step >= 4 ? 'brand' : 'sky'}>Met · step {s.step} of 6</Pill> : <Pill>Not met yet</Pill>}
      </p>
      <TermDetails term={t} showExamples={1} />
      <p className="mt-3 text-sm text-ink-3">
        In {categoryOfUnit(t.unit)?.name} · {unit.name}
      </p>
      {!open && <LockNote categoryId={unit.categoryId} progress={p} today={today} act={act} />}
      <Actions>
        {open && !s && p.focus !== t.unit && currentUnit(p, today) !== t.unit && (
          <Chip tone="brand" onClick={() => act.pick(t.unit)}>
            Learn this next
          </Chip>
        )}
        <Chip onClick={() => act.openUnit(t.unit)}>Open its unit</Chip>
      </Actions>
    </>
  );
}

function UnitView({ unitId, termId, p, today, act }: { unitId: string; termId?: string; p: Progress; today: string; act: Actions }) {
  const unit = unitById.get(unitId)!;
  const open = unitOpen(p, unitId);
  const done = isPracticeUnit(unitId) ? drillPassed(p, unitId) : termIdsOfUnit(unitId).every((id) => p.terms[id]);
  const next = currentUnit(p, today) === unitId;
  return (
    <>
      {termId && (
        <p className="mb-2">
          <b className="text-ink">{termById.get(termId)?.term}</b> is taught in this unit:
        </p>
      )}
      <p className="text-lg font-extrabold text-ink">{unit.name}</p>
      <p className="text-sm text-ink-3">
        {categoryOfUnit(unitId)?.name} · {unitSummary(p, unitId)}
        {next ? ' · next on your path' : ''}
      </p>
      {!open && <LockNote categoryId={unit.categoryId} progress={p} today={today} act={act} />}
      <Actions>
        {open && !done && !next && p.focus !== unitId && (
          <Chip tone="brand" onClick={() => act.pick(unitId)}>
            Learn this next
          </Chip>
        )}
        {open && next && (
          <Chip tone="brand" onClick={act.start}>
            Start now
          </Chip>
        )}
        <Chip onClick={() => act.openUnit(unitId)}>Open the unit</Chip>
      </Actions>
    </>
  );
}

function AreaView({ categoryId, intent, p, today, act }: { categoryId: string; intent: Intent; p: Progress; today: string; act: Actions }) {
  const area = categories.find((c) => c.id === categoryId)!;
  const open = areaOpen(p, categoryId);
  const testable = canTakeTest(p, categoryId, today);
  const met = area.terms.filter((t) => p.terms[t.id]).length;
  return (
    <>
      <p className="text-lg font-extrabold text-ink">{area.name}</p>
      <p className="text-sm text-ink-3">
        {area.units.length} units{area.terms.length ? `, ${area.terms.length} terms, ${met} met` : ''}
      </p>
      {intent === 'know' && (
        <p className="mt-2">
          {open
            ? 'Its advanced units are already open, so pick any unit below.'
            : testable
              ? 'Take its test to skip ahead: one question on each core term, and 80% opens its advanced units. Terms you get right count as learned.'
              : area.terms.length === 0
                ? 'This area has no test. Its units open as you pass its core drills.'
                : "You've tried its test today. You can try again tomorrow."}
        </p>
      )}
      {intent !== 'know' && !open && <LockNote categoryId={categoryId} progress={p} today={today} act={act} />}
      {intent === 'know' && testable && (
        <Actions>
          <Chip tone="brand" onClick={() => act.test(categoryId)}>
            Take the {area.name} test
          </Chip>
        </Actions>
      )}
      <Actions>
        {area.units.map((u) => (
          <Chip key={u.id} onClick={() => act.openUnit(u.id)}>
            {unitOpen(p, u.id) ? (
              u.name
            ) : (
              <span className="inline-flex items-center gap-1">
                <Lock className="h-3.5 w-3.5" />
                {u.name}
              </span>
            )}
          </Chip>
        ))}
      </Actions>
    </>
  );
}

function RouteView({ p, today, act }: { p: Progress; today: string; act: Actions }) {
  const cur = currentUnit(p, today);
  const s = todayStatus(p, today);
  const fresh = Object.keys(p.terms).length === 0;
  const name = cur ? unitById.get(cur)?.name : '';
  if (!cur && s.due === 0) return <p>You've finished everything open on your path. New units open as you pass area tests or turn on Go straight to quant in Settings.</p>;
  return (
    <>
      {fresh ? (
        <p>
          Start at the top of the path: money and market basics, then Indian market essentials. Every common term comes in the first few weeks, and harder units follow.{' '}
          {cur && p.focus === cur ? 'You picked ' : 'Your first unit is '}
          <b className="text-ink">{name}</b>
          {cur && p.focus === cur ? ', so it comes first.' : '.'}
        </p>
      ) : (
        <p>
          {cur ? (
            <>
              You're on <b className="text-ink">{name}</b> in {categoryOfUnit(cur)?.name}.
            </>
          ) : (
            'No new units are open right now.'
          )}{' '}
          {s.due > 0 ? `${s.due} review${s.due === 1 ? ' is' : 's are'} due today.` : 'No reviews are due today.'}
        </p>
      )}
      <Actions>
        <Chip tone="brand" onClick={act.start}>
          {fresh ? 'Start the first lesson' : 'Continue'}
        </Chip>
        <Chip onClick={() => act.go('home')}>See the path</Chip>
      </Actions>
    </>
  );
}
