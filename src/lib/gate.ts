/**
 * The password for gated parts of the app (the quant switch now, phase 3 later).
 *
 * This keeps the password out of plain sight in the code, nothing more: the app
 * has no server, so anyone who reads the code closely can get past it. To change
 * the password, run `node scripts/hash-password.mjs <new password>` and paste the
 * printed hash below.
 */
export const PASSWORD_HASH = 'a518f726236e9';

/** cyrb53: a small, fast string hash (not for real security). Kept in step with scripts/hash-password.mjs. */
export function hashPassword(text: string): string {
  let h1 = 0xdeadbeef ^ 0x51;
  let h2 = 0x41c6ce57 ^ 0x51;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

export function checkPassword(text: string): boolean {
  return hashPassword(text.trim()) === PASSWORD_HASH;
}
