/**
 * The Guide as the app runs it. Reading a message needs every term's name, which the app
 * doesn't have, so each message goes to the Worker (worker/terms.ts), which answers with the
 * full matcher (src/lib/guide.ts) and sends the names of the terms the answer shows. Turning a
 * chosen option into a reply needs only what the app knows (src/lib/guideReply.ts).
 */
import type { Reply } from './guide';
import { call } from './modes/roundApi';
import type { Progress } from './types';

/** Ask the guide. In `npm run dev`, which has no server, the same matcher runs in the page. */
export async function askGuide(text: string, p: Progress): Promise<Reply> {
  if (import.meta.env.DEV) {
    const { answer } = await import('./guide');
    return answer(text, p);
  }
  return (await call<{ reply: Reply }>('guide', { text, progress: p })).reply;
}
