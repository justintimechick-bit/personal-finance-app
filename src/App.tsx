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
import { rehydrateFromFile, getCurrentFileName, scheduleAutoSave } from './sync/fileSync';
import { db } from './db';

// Module-level guard: survives across React StrictMode's intentional double-mounting,
// ensures bootstrap + hook registration only happens once per page load.
let bootstrapStarted = false;

function useBootstrap(setNeedsOnboarding: (v: boolean) => void) {
  const { setBootstrapping, setFileStatus, markSaved } = useAppUI();

  useEffect(() => {
    if (bootstrapStarted) return;
    bootstrapStarted = true;

    (async () => {
      // Step 1: Try to restore from a linked file (this may seed the DB if the file has data)
      const existingFileName = await getCurrentFileName();
      if (existingFileName) {
        const res = await rehydrateFromFile();
        if (res.ok) {
          setFileStatus('linked', existingFileName);
          markSaved();
        } else if (res.needsPermission) {
          setFileStatus('needs_permission', existingFileName);
        } else {
          setFileStatus('none');
        }
      }

      // Step 2: If the DB is still empty (and not flagged "wiped" intentionally), route to onboarding
      const first = await isFirstLaunch();
      if (first) {
        setNeedsOnboarding(true);
      }

      // Step 3: Set up auto-save hook — any DB write triggers a debounced save
      const tables = [
        db.accounts, db.liabilities, db.incomeSources, db.fixedExpenses,
        db.tiers, db.paycheckEvents, db.netWorthSnapshots, db.settings,
      ];
      for (const t of tables) {
        t.hook('creating', () => { scheduleAutoSave(); });
        t.hook('updating', () => { scheduleAutoSave(); });
        t.hook('deleting', () => { scheduleAutoSave(); });
      }

      setBootstrapping(false);
    })();
  }, [setBootstrapping, setFileStatus, markSaved, setNeedsOnboarding]);
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
          <div className="text-xs">Checking for local data file</div>
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
