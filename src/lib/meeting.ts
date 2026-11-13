/**
 * Morning meeting: short exchanges from meetings and desk calls, each followed
 * by two questions on what the people meant. A round is five clips from five
 * different settings, with half a minute for each question.
 */
import { shuffle, type Rng } from './questions';

export const MEETING = { clips: 5, perClip: 2, passRight: 8, seconds: 30 };
export const MEETING_QUESTIONS = MEETING.clips * MEETING.perClip;

export const SETTINGS = {
  morning: 'Morning meeting',
  research: 'Research review',
  pm: 'PM catch-up',
  risk: 'Risk call',
  fno: 'F&O desk',
  execution: 'Execution desk',
  broker: 'Broker call',
  event: 'Event day',
} as const;
export type Setting = keyof typeof SETTINGS;

export interface ClipLine {
  who: string;
  text: string;
}

/** One clip as written in meetings.json. Each question's right option is written first. */
export interface Clip {
  id: string;
  setting: Setting;
  title: string;
  lines: ClipLine[];
  questions: { q: string; options: string[]; why: string }[];
  /** Term ids the clip uses, for the notes after a round. */
  terms: string[];
}

/** The clips. They come from the server when the learner opens the game (src/lib/packs.ts). */
export const clips: Clip[] = [];

export interface MeetingQuestion {
  q: string;
  options: string[];
  answer: number;
  why: string;
}

export interface MeetingItem {
  clip: Clip;
  questions: MeetingQuestion[];
}

/** Five clips from five different settings, with each question's options shuffled. */
export function newMeetingRound(rng: Rng): MeetingItem[] {
  const settings = shuffle(Object.keys(SETTINGS) as Setting[], rng).slice(0, MEETING.clips);
  return settings.map((s) => {
    const pool = clips.filter((c) => c.setting === s);
    const clip = pool[Math.floor(rng() * pool.length)];
    return {
      clip,
      questions: clip.questions.slice(0, MEETING.perClip).map((qn) => {
        const order = shuffle(
          qn.options.map((_, i) => i),
          rng,
        );
        return { q: qn.q, options: order.map((i) => qn.options[i]), answer: order.indexOf(0), why: qn.why };
      }),
    };
  });
}

export const meetingPassed = (right: number) => right >= MEETING.passRight;

/** The clip as one passage to read aloud. */
export const clipSpeech = (clip: Clip) => clip.lines.map((l) => `${l.who}: ${l.text}`).join(' ');
