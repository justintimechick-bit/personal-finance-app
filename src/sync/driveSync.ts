// Cloud sync via Google Drive (drive.file scope).
//
// Architecture:
//   - Auth: Google Identity Services token-client flow. The GIS script is
//     lazy-loaded on first sign-in attempt so the homepage stays light.
//   - Storage: a single JSON file at the user's Drive root, named
//     finance-app-data.json. The Drive file ID is cached in localStorage per
//     user email so subsequent loads skip the lookup query.
//   - Token lifetime: GIS access tokens expire after ~1 hour. On a 401 from
//     Drive, we silently re-acquire via tokenClient.requestAccessToken({prompt: ''}).
//     If the user's GIS session has also expired, status flips to token_expired
//     and the sidebar surfaces a "Sign in" button.

import { exportAllData, importAllData } from '../db';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string; error_description?: string }) => void;
          }) => { requestAccessToken: (overrideConfig?: { prompt?: '' | 'none' | 'consent' | 'select_account' }) => void };
          revoke: (accessToken: string, done: () => void) => void;
        };
      };
    };
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined;
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid';
const FILE_NAME = 'finance-app-data.json';
const FILE_ID_LS_KEY = (email: string) => `driveFileId:${email}`;

export interface DriveUser {
  email: string;
  name: string;
  pictureUrl: string | null;
}

let tokenClient: ReturnType<NonNullable<Window['google']>['accounts']['oauth2']['initTokenClient']> | null = null;
let accessToken: string | null = null;
let currentUser: DriveUser | null = null;
let cachedFileId: string | null = null;

export function isConfigured(): boolean {
  return typeof CLIENT_ID === 'string' && CLIENT_ID.length > 0;
}

export function getCurrentUser(): DriveUser | null {
  return currentUser;
}

// ─── GIS lifecycle ─────────────────────────────────────────────

let gsiPromise: Promise<void> | null = null;

export function initGsi(): Promise<void> {
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
  return gsiPromise;
}

function ensureTokenClient(): NonNullable<typeof tokenClient> {
  if (!isConfigured()) throw new Error('Google OAuth client ID not configured (set VITE_GOOGLE_OAUTH_CLIENT_ID)');
  if (tokenClient) return tokenClient;
  if (!window.google?.accounts?.oauth2) throw new Error('GIS script not loaded — call initGsi() first');
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID!,
    scope: SCOPES,
    // Callback is reassigned per-call via tokenCallbackResolver below.
    callback: () => {},
  });
  return tokenClient!;
}

// requestAccessToken's callback is fixed at init time; we swap a resolver
// reference each call so we can await the next token in a Promise.
let tokenCallbackResolver: ((token: string | null) => void) | null = null;

async function requestToken(prompt: '' | 'none' | 'consent' | 'select_account' = ''): Promise<string | null> {
  await initGsi();
  const client = ensureTokenClient();
  // Re-init the callback so it routes to our pending Promise.
  (client as any).callback = (resp: { access_token?: string; error?: string }) => {
    if (resp.access_token) {
      accessToken = resp.access_token;
      tokenCallbackResolver?.(resp.access_token);
    } else {
      tokenCallbackResolver?.(null);
    }
  };
  return new Promise<string | null>((resolve) => {
    tokenCallbackResolver = resolve;
    client.requestAccessToken({ prompt });
  });
}

async function fetchUserProfile(token: string): Promise<DriveUser> {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`userinfo fetch failed: ${r.status}`);
  const j = await r.json();
  return { email: j.email, name: j.name ?? j.email, pictureUrl: j.picture ?? null };
}

export async function signIn(): Promise<DriveUser> {
  const token = await requestToken('select_account');
  if (!token) throw new Error('Sign-in cancelled or failed');
  const user = await fetchUserProfile(token);
  currentUser = user;
  cachedFileId = localStorage.getItem(FILE_ID_LS_KEY(user.email));
  return user;
}

export async function signInSilent(): Promise<DriveUser | null> {
  if (!isConfigured()) return null;
  try {
    const token = await requestToken('none');
    if (!token) return null;
    const user = await fetchUserProfile(token);
    currentUser = user;
    cachedFileId = localStorage.getItem(FILE_ID_LS_KEY(user.email));
    return user;
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  if (accessToken && window.google?.accounts?.oauth2?.revoke) {
    await new Promise<void>((resolve) => {
      window.google!.accounts.oauth2.revoke(accessToken!, () => resolve());
    });
  }
  accessToken = null;
  currentUser = null;
  cachedFileId = null;
}

// ─── Drive REST helpers ────────────────────────────────────────

async function driveFetch(url: string, init?: RequestInit, attempt = 0): Promise<Response> {
  if (!accessToken) throw new Error('Not signed in');
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  const r = await fetch(url, { ...init, headers });
  if (r.status === 401 && attempt === 0) {
    // Token expired — try a silent refresh and retry once.
    const refreshed = await requestToken('none');
    if (refreshed) return driveFetch(url, init, attempt + 1);
  }
  return r;
}

async function findFileId(): Promise<string | null> {
  if (cachedFileId) return cachedFileId;
  const params = new URLSearchParams({
    q: `name='${FILE_NAME}' and trashed=false`,
    fields: 'files(id,name,modifiedTime)',
    spaces: 'drive',
  });
  const r = await driveFetch(`https://www.googleapis.com/drive/v3/files?${params}`);
  if (!r.ok) throw new Error(`Drive list failed: ${r.status} ${await r.text().catch(() => '')}`);
  const j = await r.json();
  const file = j.files?.[0];
  if (file?.id && currentUser) {
    cachedFileId = file.id;
    localStorage.setItem(FILE_ID_LS_KEY(currentUser.email), file.id);
    return file.id;
  }
  return null;
}

async function createFile(jsonBody: string): Promise<string> {
  // Multipart upload: metadata + media in one request.
  const boundary = '-------ffapp' + Math.random().toString(36).slice(2);
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;
  const metadata = { name: FILE_NAME, mimeType: 'application/json' };
  const body =
    delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) +
    delimiter + 'Content-Type: application/json\r\n\r\n' + jsonBody +
    closeDelim;
  const r = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!r.ok) throw new Error(`Drive create failed: ${r.status} ${await r.text().catch(() => '')}`);
  const j = await r.json();
  if (currentUser) localStorage.setItem(FILE_ID_LS_KEY(currentUser.email), j.id);
  cachedFileId = j.id;
  return j.id;
}

async function updateFile(fileId: string, jsonBody: string): Promise<void> {
  const r = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: jsonBody,
  });
  if (!r.ok) {
    if (r.status === 404) {
      // File was deleted out from under us — clear the cache and re-create.
      cachedFileId = null;
      if (currentUser) localStorage.removeItem(FILE_ID_LS_KEY(currentUser.email));
      throw new Error('Drive file was deleted; re-creating on next save');
    }
    throw new Error(`Drive update failed: ${r.status} ${await r.text().catch(() => '')}`);
  }
}

async function readFile(fileId: string): Promise<string> {
  const r = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  if (!r.ok) throw new Error(`Drive read failed: ${r.status} ${await r.text().catch(() => '')}`);
  return r.text();
}

// ─── Public sync ops ───────────────────────────────────────────

export async function loadFromDrive(): Promise<{ ok: boolean; reason?: string; emptyRemote?: boolean }> {
  if (!currentUser) return { ok: false, reason: 'not signed in' };
  try {
    const fileId = await findFileId();
    if (!fileId) return { ok: true, emptyRemote: true };
    const text = await readFile(fileId);
    if (!text.trim()) return { ok: true, emptyRemote: true };
    const data = JSON.parse(text);
    await importAllData(data);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, reason: err?.message ?? String(err) };
  }
}

export async function saveToDrive(): Promise<{ ok: boolean; reason?: string }> {
  if (!currentUser) return { ok: false, reason: 'not signed in' };
  try {
    const data = await exportAllData();
    const json = JSON.stringify(data, null, 2);
    let fileId = await findFileId();
    if (!fileId) {
      fileId = await createFile(json);
    } else {
      try {
        await updateFile(fileId, json);
      } catch (e: any) {
        // Recover from a 404 by creating a fresh file.
        if (/deleted/.test(String(e?.message))) await createFile(json);
        else throw e;
      }
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, reason: err?.message ?? String(err) };
  }
}

// Debounced auto-save — same name & shape as the old fileSync.scheduleAutoSave
// so we don't have to touch every call site.
let saveTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleAutoSave(delayMs = 1500): void {
  if (!currentUser) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void saveToDrive(); }, delayMs);
}

// ─── Manual backup / restore (kept independent of cloud sync) ──

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
    // If we're signed in, push the freshly-imported state up so Drive matches.
    if (currentUser) await saveToDrive();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, reason: err?.message ?? String(err) };
  }
}
