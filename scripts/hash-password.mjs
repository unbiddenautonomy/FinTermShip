// Prints the hash to paste into PASSWORD_HASH in src/lib/gate.ts.
// Usage: node scripts/hash-password.mjs <new password>
const text = process.argv.slice(2).join(' ').trim();
if (!text) {
  console.error('Usage: node scripts/hash-password.mjs <new password>');
  process.exit(1);
}
// Same as hashPassword in src/lib/gate.ts.
let h1 = 0xdeadbeef ^ 0x51;
let h2 = 0x41c6ce57 ^ 0x51;
for (let i = 0; i < text.length; i++) {
  const ch = text.charCodeAt(i);
  h1 = Math.imul(h1 ^ ch, 2654435761);
  h2 = Math.imul(h2 ^ ch, 1597334677);
}
h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
console.log((4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16));
