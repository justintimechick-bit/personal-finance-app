import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAppUI } from '../store/useAppStore';

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/payday', label: 'Payday' },
  { to: '/accounts', label: 'Accounts' },
  { to: '/manage', label: 'Manage' },
  { to: '/trends', label: 'Trends' },
  { to: '/settings', label: 'Settings' },
];

export default function Layout() {
  const { fileName, fileStatus, lastSavedAt, toast } = useAppUI();

  const saveLabel = fileStatus === 'linked' && fileName
    ? `Synced → ${fileName}${lastSavedAt ? ` · ${timeSince(lastSavedAt)}` : ''}`
    : fileStatus === 'needs_permission'
      ? 'File permission needed — see Settings'
      : 'Not linked to a local file — see Settings';

  return (
    <div className="flex h-full">
      <aside className="w-60 shrink-0 border-r border-ink-700 bg-ink-800/60 flex flex-col">
        <div className="p-4 border-b border-ink-700">
          <Link to="/" className="block font-semibold text-lg">Finance</Link>
          <div className="text-xs text-ink-300 mt-0.5">personal tracker</div>
        </div>
        <nav className="p-2 flex-1">
          {NAV.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-ink-700 text-ink-50' : 'text-ink-200 hover:bg-ink-700/50'
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className={`p-3 text-xs border-t border-ink-700 ${
          fileStatus === 'linked' ? 'text-accent' :
          fileStatus === 'needs_permission' ? 'text-warn' :
          'text-ink-300'
        }`}>
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${
              fileStatus === 'linked' ? 'bg-accent' :
              fileStatus === 'needs_permission' ? 'bg-warn' :
              'bg-ink-400'
            }`} />
            <span className="truncate">{saveLabel}</span>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6 md:p-8">
          <Outlet />
        </div>
      </main>
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg border text-sm ${
          toast.kind === 'success' ? 'bg-accent/20 border-accent/40 text-accent' :
          toast.kind === 'error' ? 'bg-danger/20 border-danger/40 text-danger' :
          'bg-ink-700 border-ink-600 text-ink-50'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

function timeSince(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
