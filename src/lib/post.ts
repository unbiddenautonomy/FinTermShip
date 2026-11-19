/**
 * Packing what the app sends. The learner's whole progress goes up with every sync, lesson and
 * round: 47 KB of JSON after three weeks and 126 KB after six months, uncompressed, because
 * browsers compress replies but never requests. Gzipped it is about a tenth of that.
 *
 * A packed body carries `x-packed: gzip`, and the Worker unpacks it (worker/index.ts). Anything
 * small, or a browser without CompressionStream, is sent as plain JSON as before.
 */
export const PACKED_HEADER = 'x-packed';

/** Below this a body isn't worth packing. */
const PACK_FROM = 4096;

export async function packJson(value: unknown): Promise<{ body: BodyInit; headers: Record<string, string> }> {
  const text = JSON.stringify(value);
  const plain = { body: text, headers: { 'content-type': 'application/json' } };
  if (text.length < PACK_FROM || typeof CompressionStream === 'undefined') return plain;
  try {
    const packed = await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    return { body: packed, headers: { 'content-type': 'application/json', [PACKED_HEADER]: 'gzip' } };
  } catch {
    // Packing is an optimisation: if it fails for any reason, send it as it was.
    return plain;
  }
}
