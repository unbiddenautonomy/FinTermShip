import { newProgress } from './scheduler';
import type { Progress } from './types';

const DB_NAME = 'fintermship';
const STORE = 'kv';
const KEY = 'progress';
const LS_KEY = 'fintermship-progress';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Fill in any fields added since the progress was saved. */
export function normalise(raw: unknown): Progress {
  const base = newProgress();
  if (!raw || typeof raw !== 'object') return base;
  const p = raw as Partial<Progress>;
  if (p.version !== 1 || typeof p.terms !== 'object') return base;
  return {
    ...base,
    ...p,
    settings: { ...base.settings, ...(p.settings ?? {}) },
    days: p.days ?? {},
  } as Progress;
}

export async function loadProgress(): Promise<Progress> {
  try {
    const fromDb = await idbGet<Progress>(KEY);
    if (fromDb) return normalise(fromDb);
  } catch {
    // IndexedDB can be unavailable (private mode in some browsers); fall back below.
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return normalise(JSON.parse(raw));
  } catch {
    // Ignore unreadable storage and start fresh.
  }
  return newProgress();
}

export async function saveProgress(p: Progress): Promise<void> {
  try {
    await idbSet(KEY, p);
    return;
  } catch {
    // Fall through to localStorage.
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {
    // Nothing more we can do; progress stays in memory for this visit.
  }
}

/** Ask the browser not to clear our data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export function exportProgress(p: Progress, today: string): void {
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fintermship-backup-${today}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readBackupFile(file: File): Promise<Progress> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed || parsed.version !== 1 || typeof parsed.terms !== 'object') {
    throw new Error('This file is not a FinTermShip backup.');
  }
  return normalise(parsed);
}
