import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './screens/Dashboard';
import Payday from './screens/Payday';
import Accounts from './screens/Accounts';
import Manage from './screens/Manage';
import Trends from './screens/Trends';
import Settings from './screens/Settings';
import Onboarding from './screens/Onboarding';
import { isFirstLaunch } from './db';
import { useAppUI } from './store/useAppStore';
import { isConfigured, signInSilent, loadFromDrive, scheduleAutoSave } from './sync/driveSync';
import { db } from './db';

// Module-level guard: survives across React StrictMode's intentional double-mounting,
// ensures bootstrap + hook registration only happens once per page load.
let bootstrapStarted = false;

function useBootstrap(setNeedsOnboarding: (v: boolean) => void) {
  const { setBootstrapping, setDriveStatus, markSynced } = useAppUI();

  useEffect(() => {
    if (bootstrapStarted) return;
    bootstrapStarted = true;

    (async () => {
      try {
        // Step 1: If Drive sync is configured, try a silent sign-in. Wrap in a
        // 5s timeout so a hung Google call can't pin the app on "Loading…".
        if (isConfigured()) {
          const silent = signInSilent();
          const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
          const user = await Promise.race([silent, timeout]);
          if (user) {
            setDriveStatus('signed_in', user);
            const r = await loadFromDrive();
            if (r.ok) markSynced();
          } else {
            setDriveStatus('signed_out');
          }
        }

        // Step 2: If the DB is still empty (and not flagged "wiped" intentionally), route to onboarding
        const first = await isFirstLaunch();
        if (first) {
          setNeedsOnboarding(true);
        }

        // Step 3: Set up auto-save hook — any DB write triggers a debounced
        // Drive save (no-op when signed out) and updates the "last edit"
        // timestamp shown in the sidebar.
        const tables = [
          db.accounts, db.liabilities, db.incomeSources, db.fixedExpenses,
          db.tiers, db.paycheckEvents, db.netWorthSnapshots, db.settings,
        ];
        const onWrite = () => {
          useAppUI.getState().markEdited();
          scheduleAutoSave();
        };
        for (const t of tables) {
          t.hook('creating', onWrite);
          t.hook('updating', onWrite);
          t.hook('deleting', onWrite);
        }
      } catch (err) {
        console.error('Bootstrap error:', err);
      } finally {
        // Always finish bootstrap — never leave the user stuck on "Loading…"
        setBootstrapping(false);
      }
    })();
  }, [setBootstrapping, setDriveStatus, markSynced, setNeedsOnboarding]);
}

function OnboardingGate({ needsOnboarding }: { needsOnboarding: boolean }) {
  const location = useLocation();
  if (needsOnboarding && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  return null;
}

export default function App() {
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  useBootstrap(setNeedsOnboarding);
  const isBootstrapping = useAppUI(s => s.isBootstrapping);

  if (isBootstrapping) {
    return (
      <div className="h-full grid place-items-center text-ink-300">
        <div className="text-center">
          <div className="animate-pulse text-lg mb-2">Loading…</div>
          <div className="text-xs">Checking for cloud sync</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <OnboardingGate needsOnboarding={needsOnboarding} />
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/payday" element={<Payday />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/manage" element={<Manage />} />
          <Route path="/trends" element={<Trends />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </>
  );
}
