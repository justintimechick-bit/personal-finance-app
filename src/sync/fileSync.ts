import { db, exportAllData, importAllData } from '../db';

// Type hints — File System Access API is not yet in all TS lib versions
type FileSystemFileHandle = any;

const HANDLE_KEY = 'fileHandle';
const SUPPORTED = typeof window !== 'undefined' && 'showSaveFilePicker' in window;

export function fileSyncSupported(): boolean {
  return SUPPORTED;
}

// --- Handle storage (persisted in IndexedDB) ---

async function getStoredHandle(): Promise<FileSystemFileHandle | null> {
  const rec = await db.meta.get(HANDLE_KEY);
  return rec?.value ?? null;
}

async function setStoredHandle(handle: FileSystemFileHandle | null): Promise<void> {
  if (handle === null) {
    await db.meta.delete(HANDLE_KEY);
  } else {
    await db.meta.put({ key: HANDLE_KEY, value: handle });
  }
}

// --- Permission management ---

async function verifyPermission(handle: FileSystemFileHandle, readWrite = true): Promise<boolean> {
  const opts = { mode: readWrite ? 'readwrite' : 'read' };
  // @ts-ignore — File System Access API
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  // @ts-ignore
  if ((await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}

// --- Public API ---

export async function pickNewFile(): Promise<{ ok: true; name: string } | { ok: false; reason: string }> {
  if (!SUPPORTED) return { ok: false, reason: 'File System Access API not supported in this browser. Use Chrome or Edge.' };

  try {
    const suggestedName = `finance-${new Date().toISOString().slice(0, 10)}.json`;
    // @ts-ignore
    const handle: FileSystemFileHandle = await window.showSaveFilePicker({
      suggestedName,
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
    await setStoredHandle(handle);
    await writeToFile(); // initial write
    return { ok: true, name: handle.name };
  } catch (err: any) {
    if (err?.name === 'AbortError') return { ok: false, reason: 'cancelled' };
    return { ok: false, reason: err?.message ?? String(err) };
  }
}

export async function openExistingFile(): Promise<{ ok: true; name: string } | { ok: false; reason: string }> {
  if (!SUPPORTED) return { ok: false, reason: 'File System Access API not supported in this browser. Use Chrome or Edge.' };

  try {
    // @ts-ignore
    const [handle]: [FileSystemFileHandle] = await window.showOpenFilePicker({
      multiple: false,
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
    const ok = await verifyPermission(handle, true);
    if (!ok) return { ok: false, reason: 'Permission denied' };
    const file = await handle.getFile();
    const text = await file.text();
    if (text.trim()) {
      const data = JSON.parse(text);
      await importAllData(data);
    }
    await setStoredHandle(handle);
    return { ok: true, name: handle.name };
  } catch (err: any) {
    if (err?.name === 'AbortError') return { ok: false, reason: 'cancelled' };
    return { ok: false, reason: err?.message ?? String(err) };
  }
}

export async function clearFileHandle(): Promise<void> {
  await setStoredHandle(null);
}

export async function getCurrentFileName(): Promise<string | null> {
  const handle = await getStoredHandle();
  return handle?.name ?? null;
}

export async function rehydrateFromFile(): Promise<{ ok: boolean; needsPermission?: boolean; reason?: string }> {
  const handle = await getStoredHandle();
  if (!handle) return { ok: false, reason: 'no handle stored' };
  const granted = await verifyPermission(handle, true);
  if (!granted) return { ok: false, needsPermission: true };
  try {
    const file = await handle.getFile();
    const text = await file.text();
    if (text.trim()) {
      const data = JSON.parse(text);
      await importAllData(data);
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, reason: err?.message ?? String(err) };
  }
}

export async function writeToFile(): Promise<{ ok: boolean; reason?: string }> {
  const handle = await getStoredHandle();
  if (!handle) return { ok: false, reason: 'no file selected' };
  const granted = await verifyPermission(handle, true);
  if (!granted) return { ok: false, reason: 'permission denied' };
  try {
    const data = await exportAllData();
    const json = JSON.stringify(data, null, 2);
    // @ts-ignore
    const writable = await handle.createWritable();
    await writable.write(json);
    await writable.close();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, reason: err?.message ?? String(err) };
  }
}

// Download fallback (for Safari or if the user declines the file picker)
export async function downloadBackup(): Promise<void> {
  const data = await exportAllData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `finance-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function uploadBackup(file: File): Promise<{ ok: boolean; reason?: string }> {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await importAllData(data);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, reason: err?.message ?? String(err) };
  }
}

/**
 * Debounced auto-save: call this after any mutation to persist to the file.
 * If no file is picked yet, silently skips.
 */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleAutoSave(delayMs = 1500): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void writeToFile();
  }, delayMs);
}
