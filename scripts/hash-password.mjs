// Prints a hash of the password that opens the quant switch and phase 3, for the Worker.
// Usage: node scripts/hash-password.mjs <new password>
// Then either set it as a runtime secret named UNLOCK_HASH on the Worker (Settings, Variables
// and secrets), or paste it into UNLOCK_HASH in worker/index.ts. The app never sees it.
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const text = process.argv.slice(2).join(' ').trim();
if (!text) {
  console.error('Usage: node scripts/hash-password.mjs <new password>');
  process.exit(1);
}
// Same as hashPassword in worker/index.ts: PBKDF2-SHA256, 100,000 rounds, a 16-byte salt.
const salt = randomBytes(16);
const hash = pbkdf2Sync(text, salt, 100_000, 32, 'sha256');
console.log(['pbkdf2', 100_000, salt.toString('base64'), hash.toString('base64')].join('$'));
