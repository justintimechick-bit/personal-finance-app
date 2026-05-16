import { create } from 'zustand';
import type { DriveUser } from '../sync/driveSync';

export type DriveStatus = 'signed_out' | 'signed_in' | 'token_expired' | 'error';

interface AppUIState {
  isBootstrapping: boolean;
  needsOnboarding: boolean;
  authRequired: boolean;
  driveStatus: DriveStatus;
  driveUser: DriveUser | null;
  lastSyncedAt: number | null;
  lastEditedAt: number | null;
  toast: { message: string; kind: 'info' | 'success' | 'error' } | null;
  privacyMode: boolean;
  setBootstrapping: (v: boolean) => void;
  setNeedsOnboarding: (v: boolean) => void;
  setAuthRequired: (v: boolean) => void;
  setDriveStatus: (s: DriveStatus, user?: DriveUser | null) => void;
  markSynced: () => void;
  markEdited: () => void;
  showToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
  clearToast: () => void;
  togglePrivacy: () => void;
}

const PRIVACY_KEY = 'finance.privacyMode';
const initialPrivacy = (() => {
  try { return localStorage.getItem(PRIVACY_KEY) === '1'; } catch { return false; }
})();

export const useAppUI = create<AppUIState>((set, get) => ({
  isBootstrapping: true,
  needsOnboarding: false,
  authRequired: false,
  driveStatus: 'signed_out',
  driveUser: null,
  lastSyncedAt: null,
  lastEditedAt: null,
  toast: null,
  privacyMode: initialPrivacy,
  setBootstrapping: (v) => set({ isBootstrapping: v }),
  setNeedsOnboarding: (v) => set({ needsOnboarding: v }),
  setAuthRequired: (v) => set({ authRequired: v }),
  setDriveStatus: (s, user) => set({ driveStatus: s, driveUser: user ?? null }),
  markSynced: () => set({ lastSyncedAt: Date.now() }),
  markEdited: () => set({ lastEditedAt: Date.now() }),
  showToast: (message, kind = 'info') => {
    set({ toast: { message, kind } });
    setTimeout(() => set({ toast: null }), 3500);
  },
  clearToast: () => set({ toast: null }),
  togglePrivacy: () => {
    const next = !get().privacyMode;
    try { localStorage.setItem(PRIVACY_KEY, next ? '1' : '0'); } catch {}
    set({ privacyMode: next });
  },
}));
