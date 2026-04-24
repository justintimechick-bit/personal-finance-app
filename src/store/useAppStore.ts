import { create } from 'zustand';

interface AppUIState {
  isBootstrapping: boolean;
  fileStatus: 'none' | 'linked' | 'needs_permission' | 'error';
  fileName: string | null;
  lastSavedAt: number | null;
  toast: { message: string; kind: 'info' | 'success' | 'error' } | null;
  setBootstrapping: (v: boolean) => void;
  setFileStatus: (s: AppUIState['fileStatus'], name?: string | null) => void;
  markSaved: () => void;
  showToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
  clearToast: () => void;
}

export const useAppUI = create<AppUIState>((set) => ({
  isBootstrapping: true,
  fileStatus: 'none',
  fileName: null,
  lastSavedAt: null,
  toast: null,
  setBootstrapping: (v) => set({ isBootstrapping: v }),
  setFileStatus: (s, name) => set({ fileStatus: s, fileName: name ?? null }),
  markSaved: () => set({ lastSavedAt: Date.now() }),
  showToast: (message, kind = 'info') => {
    set({ toast: { message, kind } });
    setTimeout(() => set({ toast: null }), 3500);
  },
  clearToast: () => set({ toast: null }),
}));
