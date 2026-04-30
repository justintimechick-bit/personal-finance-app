import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useAppUI } from '../store/useAppStore';
import {
  scheduleAutoSave, saveToDrive, signIn, downloadBackup, isConfigured,
} from '../sync/driveSync';

const NAV = [
  { to: '/',         label: 'Dashboard', icon: '⊞' },
  { to: '/payday',   label: 'Payday',    icon: '↑' },
  { to: '/accounts', label: 'Accounts',  icon: '⊟' },
  { to: '/manage',   label: 'Manage',    icon: '◧' },
  { to: '/trends',   label: 'Trends',    icon: '↗' },
  { to: '/settings', label: 'Settings',  icon: '⊙' },
];

export default function Layout() {
  const { driveUser, driveStatus, lastSyncedAt, lastEditedAt, toast, markSynced, setDriveStatus, showToast } = useAppUI();
  const settings = useLiveQuery(() => db.settings.get(1), []);

  // Tick once every 30s to keep "X ago" timestamps fresh without heavier plumbing.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick(n => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const [saving, setSaving] = useState(false);

  async function handleSaveNow() {
    setSaving(true);
    const res = await saveToDrive();
    setSaving(false);
    if (res.ok) {
      markSynced();
      showToast('Synced to Drive', 'success');
    } else {
      showToast(`Sync failed: ${res.reason ?? 'unknown error'}`, 'error');
    }
  }
  async function handleSignIn() {
    try {
      const user = await signIn();
      setDriveStatus('signed_in', user);
      const res = await saveToDrive();
      if (res.ok) {
        markSynced();
        showToast(`Signed in as ${user.email}`, 'success');
      } else {
        showToast(`Signed in but sync failed: ${res.reason}`, 'error');
      }
    } catch (err: any) {
      if (!/cancelled/i.test(String(err?.message))) {
        showToast(`Sign-in failed: ${err?.message ?? String(err)}`, 'error');
      }
    }
  }
  async function handleDownload() {
    await downloadBackup();
    showToast('Backup downloaded', 'success');
  }
  const appName = settings?.appName?.trim() || 'Finance';
  const appTagline = settings?.appTagline ?? 'personal tracker';
  const badgeLetter = (appName.charAt(0) || 'F').toUpperCase();

  async function saveAppName(value: string) {
    const next = value.trim() || 'Finance';
    if (next === appName) return;
    await db.settings.update(1, { appName: next });
    scheduleAutoSave(500);
  }
  async function saveAppTagline(value: string) {
    if (value === appTagline) return;
    await db.settings.update(1, { appTagline: value });
    scheduleAutoSave(500);
  }

  // Most recent activity timestamp — edit OR sync, whichever is newer.
  const latestActivity = Math.max(lastEditedAt ?? 0, lastSyncedAt ?? 0);
  const dirty = (lastEditedAt ?? 0) > (lastSyncedAt ?? 0);
  const signedIn = driveStatus === 'signed_in';

  const dotColor = signedIn ? (dirty ? 'bg-warn' : 'bg-accent')
                  : driveStatus === 'token_expired' ? 'bg-warn'
                  : 'bg-ink-300';
  const textColor = signedIn ? (dirty ? 'text-warn' : 'text-accent')
                   : driveStatus === 'token_expired' ? 'text-warn'
                   : 'text-ink-200';

  const oauthConfigured = isConfigured();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Link to="/" className="sidebar-mark" aria-label="Home">{badgeLetter}</Link>
          <div className="min-w-0 flex-1">
            <InlineEdit
              value={appName}
              onSave={saveAppName}
              className="sidebar-title block w-full bg-transparent border-0 focus:outline-none focus:bg-ink-700/40 rounded px-1 -mx-1"
              placeholder="App name"
            />
            <InlineEdit
              value={appTagline}
              onSave={saveAppTagline}
              className="sidebar-sub block w-full bg-transparent border-0 focus:outline-none focus:bg-ink-700/40 rounded px-1 -mx-1"
              placeholder="Tagline"
            />
          </div>
        </div>
        <nav className="sidebar-nav">
          {NAV.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
              }
            >
              <span className="sidebar-icon">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-status flex flex-col gap-1.5 items-start">
          <div className="flex items-center gap-1.5 truncate w-full">
            {signedIn && driveUser?.pictureUrl ? (
              <img src={driveUser.pictureUrl} alt="" className="w-4 h-4 rounded-full shrink-0" referrerPolicy="no-referrer" />
            ) : (
              <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
            )}
            <span className={`truncate ${textColor}`} title={signedIn ? driveUser?.email : undefined}>
              {signedIn
                ? (dirty ? 'Unsaved changes' : `Synced · ${latestActivity ? timeSince(latestActivity) : 'just now'}`)
                : driveStatus === 'token_expired'
                  ? 'Re-sign in needed'
                  : `Browser only · ${latestActivity ? `edit ${timeSince(latestActivity)}` : 'no edits yet'}`}
            </span>
          </div>
          <div className="flex gap-1 flex-wrap">
            {signedIn && (
              <button
                className="btn-ghost text-[10px] px-2 py-0.5"
                onClick={handleSaveNow}
                disabled={saving}
                title="Sync to Drive now"
              >
                {saving ? 'Syncing…' : 'Sync now'}
              </button>
            )}
            {!signedIn && oauthConfigured && (
              <button className="btn-ghost text-[10px] px-2 py-0.5" onClick={handleSignIn}>
                {driveStatus === 'token_expired' ? 'Sign in' : 'Sign in with Google'}
              </button>
            )}
            {!signedIn && (
              <button className="btn-ghost text-[10px] px-2 py-0.5" onClick={handleDownload}>Download</button>
            )}
          </div>
        </div>
      </aside>

      <main className="screen">
        <div className="screen-grid">
          <Outlet />
        </div>
      </main>

      {toast && (
        <div className={`toast ${
          toast.kind === 'success' ? 'toast-success' :
          toast.kind === 'error'   ? 'toast-error'   : 'toast-info'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

function InlineEdit({
  value, onSave, className, placeholder,
}: {
  value: string;
  onSave: (next: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external changes (e.g. settings reload) into the input when not focused.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(value);
  }, [value]);

  return (
    <input
      ref={inputRef}
      className={className}
      value={draft}
      placeholder={placeholder}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => onSave(draft)}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.currentTarget as HTMLInputElement).blur();
        }
        if (e.key === 'Escape') {
          setDraft(value);
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function timeSince(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
