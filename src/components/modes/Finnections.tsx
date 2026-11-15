/**
 * Finnections: sixteen terms on tiles, four hidden groups of four. Pick four and submit; four
 * mistakes end the board. The server deals the tiles without the groups and checks each guess;
 * the groups come back only once the board is over. Each group found is an answer for its terms
 * in the shared record, with the reason its terms belong together (src/lib/modes/rounds.ts).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { termById } from '../../lib/content';
import { kpis, type Kpis, type ModeId } from '../../lib/modes/knowledge';
import { guessBoard, revealBoard } from '../../lib/modes/roundApi';
import { access, levelNote, boardScore, finishRound, levelState, recordBoard, type FoundGroup } from '../../lib/modes/rounds';
import { seededRng, shuffle } from '../../lib/questions';
import { finishLesson } from '../../lib/scheduler';
import type { Progress } from '../../lib/types';
import { Button } from '../ui';
import { KpiDelta } from './KpiDelta';
import { useModeAccess } from './modeAccess';
import { LevelMeter, NotYet } from './roundKit';
import { useDealtRound } from './useRoundContent';
import { ModeFrame, TermSheet } from './shared';

interface Props {
  progress: Progress;
  today: string;
  onProgress: (p: Progress) => void;
  onMode: (m: ModeId) => void;
}

const MISTAKES = 4;
/** Group colours, in the board's own order (easiest first), so a colour hints at nothing while playing. */
const GROUP_COLOURS = ['#f2c66d', '#8fd0c4', '#b9a6e8', '#f0a3a3'];
const BG = '#f3f1fa';
const TILE = '#e2def0';
const DEEP = '#3b3058';
const INK = '#221d33';

const name = (id: string) => termById.get(id)?.term ?? id;

export function Finnections({ progress, today, onProgress, onMode }: Props) {
  const open = access('finnections').open;
  const [seed, setSeed] = useState(() => Date.now() % 2_147_483_647);
  const content = useDealtRound('finnections', progress, today, seed, open);
  const board = content.items[0];
  const [tiles, setTiles] = useState<string[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  // Groups found so far, as the server marked them; every group once the board is over.
  const [found, setFound] = useState<FoundGroup[]>([]);
  const [all, setAll] = useState<FoundGroup[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string[]>([]);
  const [done, setDone] = useState<{ before: number; after: number; good: number; won: boolean } | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const startedAt = useRef(Date.now());
  const startKpis = useRef<Kpis>(kpis(progress, today));
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const { canOpen } = useModeAccess();

  useEffect(() => {
    if (!board) return;
    setTiles(board.tiles);
    setSel([]);
    setFound([]);
    setAll(null);
    setTried([]);
    setMistakes(0);
    setNote(null);
    setDone(null);
    startedAt.current = Date.now();
  }, [board, seed]);

  /** End the board: get every group, record their terms, count the round, and move the level. */
  const end = useCallback(
    async (foundNames: string[], lastFree: boolean, misses: number, known?: FoundGroup[]) => {
      if (!board) return;
      const ms = Math.round((Date.now() - startedAt.current) / 16);
      let groups: FoundGroup[];
      try {
        groups = known ?? (await revealBoard(board.id));
      } catch (e) {
        setNote(e instanceof Error ? e.message : 'The board didn’t close. Try again.');
        return false;
      }
      setAll(groups);
      setFound(foundNames.map((n) => groups.find((g) => g.name === n)!));
      let p = recordBoard(progressRef.current, { id: board.id, level: board.level, groups }, foundNames, lastFree, ms, today);
      const score = boardScore(foundNames.length);
      const before = levelState(p, 'finnections').level;
      p = finishLesson(p, today, 10 + (score === 1 && misses === 0 ? 5 : 0));
      p = finishRound(p, 'finnections', today, [board.id], score);
      onProgress(p);
      const after = levelState(p, 'finnections');
      setDone({ before, after: after.level, good: after.good, won: foundNames.length === 4 });
      return true;
    },
    [board, today, onProgress],
  );

  const submit = async () => {
    if (!board || done || busy || sel.length !== 4) return;
    const key = [...sel].sort().join('|');
    if (tried.includes(key)) {
      setNote('You already tried those four.');
      return;
    }
    setBusy(true);
    try {
      let reply: Awaited<ReturnType<typeof guessBoard>>;
      try {
        reply = await guessBoard(board.id, sel);
      } catch (e) {
        setNote(e instanceof Error ? e.message : 'That guess didn’t go through. Try again.');
        return;
      }
      const g = reply.group;
      if (g) {
        const now = [...found, g];
        setSel([]);
        setNote(null);
        setFound(now);
        setTiles((t) => t.filter((id) => !g.terms.includes(id)));
        // The last four can only be one group: it is shown, and counted as practice.
        if (now.length === 3) {
          const names = now.map((x) => x.name);
          const groups = await revealBoard(board.id).catch(() => null);
          const last = groups?.find((x) => !names.includes(x.name));
          if (!last) {
            setNote('The board didn’t close. Try again.');
            return;
          }
          setTiles([]);
          await end([...names, last.name], true, mistakes, groups ?? undefined);
        }
        return;
      }
      const m = mistakes + 1;
      setTried((t) => [...t, key]);
      setMistakes(m);
      setWrong(sel);
      setNote(reply.oneAway ? 'One away.' : 'Not a group.');
      if (m >= MISTAKES) {
        setSel([]);
        if (await end(found.map((x) => x.name), false, m)) setTiles([]);
      }
    } finally {
      setBusy(false);
    }
  };

  const again = () => {
    startKpis.current = kpis(progressRef.current, today);
    setSeed((s) => s + 1);
  };

  const frame = (body: React.ReactNode) => (
    <ModeFrame progress={progress} today={today} mode="finnections" onMode={onMode} title="Finnections" aside={open ? <LevelMeter progress={progress} mode="finnections" /> : undefined}>
      {body}
      {sheet && <TermSheet termId={sheet} progress={progress} today={today} onClose={() => setSheet(null)} onOpenTerm={setSheet} />}
    </ModeFrame>
  );

  if (!open) return frame(<NotYet mode="finnections" onMode={onMode} />);
  if (content.state === 'loading') return frame(<p className="py-16 text-center text-sm font-bold text-ink-3">Dealing the board…</p>);
  if (content.state !== 'ready' || !board) return frame(<NotYet mode="finnections" error={content.state !== 'ready' ? content.state : 'No boards came through. Try again in a moment.'} onMode={onMode} onRetry={content.retry} />);

  const foundNames = found.map((g) => g.name);
  const missed = done && all ? all.filter((g) => !foundNames.includes(g.name)) : [];
  const lastFree = done?.won ? foundNames[foundNames.length - 1] : null;

  return frame(
    <div className="space-y-4">
      <div className="-mx-4 space-y-2 px-4 py-5 sm:mx-0 sm:rounded-3xl sm:px-5" style={{ background: BG, color: INK }}>
        {[...found, ...missed].map((g) => (
          <GroupBar key={g.name} group={g} colour={GROUP_COLOURS[g.order]} missed={!foundNames.includes(g.name)} free={g.name === lastFree} open={!!done} onTerm={setSheet} />
        ))}
        {tiles.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {tiles.map((id) => {
              const on = sel.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setNote(null);
                    setWrong([]);
                    setSel((s) => (on ? s.filter((x) => x !== id) : s.length < 4 ? [...s, id] : s));
                  }}
                  className={`flex min-h-[4.25rem] items-center justify-center rounded-xl px-1.5 py-2 text-center text-[12.5px] font-extrabold leading-tight transition [hyphens:auto] [overflow-wrap:anywhere] active:scale-95 sm:text-sm ${wrong.includes(id) ? 'animate-shake' : ''}`}
                  style={{ background: on ? DEEP : TILE, color: on ? '#fff' : INK }}
                  lang="en"
                >
                  {name(id)}
                </button>
              );
            })}
          </div>
        )}
        {!done && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <span className="text-[13px] font-bold" style={{ color: '#5b5375' }} aria-label={`${MISTAKES - mistakes} mistakes left`}>
              Mistakes left{' '}
              <span className="tracking-[0.2em]" aria-hidden="true">
                {'●'.repeat(MISTAKES - mistakes)}
                {'○'.repeat(mistakes)}
              </span>
            </span>
            <span className="flex gap-2">
              <button type="button" onClick={() => setTiles((t) => shuffle(t, seededRng(Date.now() % 100000)))} className="rounded-full border-[1.5px] px-3.5 py-1.5 text-[13px] font-extrabold" style={{ borderColor: DEEP, color: DEEP }}>
                Shuffle
              </button>
              <button type="button" onClick={() => setSel([])} disabled={!sel.length} className="rounded-full border-[1.5px] px-3.5 py-1.5 text-[13px] font-extrabold disabled:opacity-40" style={{ borderColor: DEEP, color: DEEP }}>
                Clear
              </button>
              <button type="button" onClick={() => void submit()} disabled={sel.length !== 4 || busy} className="rounded-full px-4 py-1.5 text-[13px] font-extrabold text-white disabled:opacity-40" style={{ background: DEEP }}>
                Submit
              </button>
            </span>
          </div>
        )}
        {note && !done && (
          <p className="animate-pop rounded-xl bg-white px-3 py-2 text-sm font-extrabold" role="status">
            {note}
          </p>
        )}
      </div>

      {done ? (
        <div className="space-y-4">
          <div className="rounded-3xl border border-line bg-surface p-5 text-center shadow-card">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-ink-3">{done.won ? 'Board solved' : 'Out of mistakes'}</p>
            <p className="num mt-2 font-mono text-5xl font-semibold text-ink">
              {found.length}
              <span className="text-2xl text-ink-3">/4</span>
            </p>
            <p className="mt-1 text-sm text-ink-2">groups found{done.won ? `, with ${mistakes} mistake${mistakes === 1 ? '' : 's'}` : ''}</p>
            <p className="mt-3 text-sm font-bold text-ink">{levelNote(done.before, done.after, done.good)}</p>
          </div>
          <KpiDelta
            before={startKpis.current}
            after={kpis(progress, today)}
            note="Each group you found counts like picking a meaning, so it can clear a due review. A group you missed brings its terms back tomorrow."
          />
          <div className={`grid gap-3 ${canOpen('headline') && access('headline').open ? 'grid-cols-2' : ''}`}>
            <Button onClick={again}>Next board</Button>
            {canOpen('headline') && access('headline').open && (
              <Button variant="secondary" onClick={() => onMode('headline')}>
                Headline Desk
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-center text-xs text-ink-3">Tap four tiles that belong together. Some tiles look like they fit two groups: only one way uses all sixteen.</p>
      )}
    </div>,
  );
}

function GroupBar({ group, colour, missed, free, open, onTerm }: { group: FoundGroup; colour: string; missed: boolean; free: boolean; open: boolean; onTerm: (id: string) => void }) {
  return (
    <div className="animate-pop rounded-2xl px-4 py-3 text-center" style={{ background: colour, color: '#1a1625', opacity: missed ? 0.85 : 1, outline: missed ? '2px dashed rgb(26 22 37 / 0.45)' : undefined, outlineOffset: -4 }}>
      <p className="text-[13px] font-extrabold uppercase tracking-[0.08em]">
        {group.name}
        {missed && <span className="ml-2 rounded bg-white/70 px-1.5 py-0.5 text-[10px] tracking-wider">missed</span>}
        {free && <span className="ml-2 rounded bg-white/70 px-1.5 py-0.5 text-[10px] tracking-wider">last four</span>}
      </p>
      <p className="mt-0.5 text-[13px] font-semibold">
        {group.terms.map((id, i) => (
          <span key={id}>
            {i > 0 && ' · '}
            {open ? (
              <button type="button" onClick={() => onTerm(id)} className="underline decoration-dotted underline-offset-2">
                {name(id)}
              </button>
            ) : (
              name(id)
            )}
          </span>
        ))}
      </p>
      {open && <p className="mx-auto mt-1.5 max-w-prose text-[13px] leading-snug opacity-90">{group.why}</p>}
    </div>
  );
}
