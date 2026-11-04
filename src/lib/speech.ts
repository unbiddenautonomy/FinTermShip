import type { Term } from './types';

let cachedVoice: SpeechSynthesisVoice | null | undefined;

function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined) return cachedVoice;
  const voices = window.speechSynthesis?.getVoices() ?? [];
  if (!voices.length) return null;
  cachedVoice =
    voices.find((v) => v.lang === 'en-IN') ??
    voices.find((v) => v.lang.startsWith('en-IN')) ??
    voices.find((v) => v.lang === 'en-GB') ??
    voices.find((v) => v.lang.startsWith('en')) ??
    null;
  return cachedVoice;
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

if (canSpeak()) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = undefined;
  };
}

export function speak(text: string): void {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if (v) u.voice = v;
  u.lang = v?.lang ?? 'en-IN';
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

export function speakTerm(t: Term): void {
  speak(t.speak ?? t.term);
}
