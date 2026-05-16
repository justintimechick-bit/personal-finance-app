import { useState, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './screens/Dashboard';
import Payday from './screens/Payday';
import Accounts from './screens/Accounts';
import Manage from './screens/Manage';
import Trends from './screens/Trends';
import Settings from './screens/Settings';
import Onboarding from './screens/Onboarding';
import { GoogleSignInWall } from './components/GoogleSignInWall';
import { isFirstLaunch } from './db';
import { useAppUI } from './store/useAppStore';
import { isConfigured, signInSilent, loadFromDrive, scheduleAutoSave } from './sync/driveSync';
import type { DriveUser } from './sync/driveSync';
import { db } from './db';

// Module-level guard: survives across React StrictMode's intentional double-mounting,
// ensures bootstrap + hook registration only happens once per page load.
let bootstrapStarted = false;

function useBootstrap(setConfigError: (v: boolean) => void) {
  const {
    setBootstrapping,
    setDriveStatus,
    markSynced,
    setNeedsOnboarding,
    setAuthRequired,
  } = useAppUI();

  useEffect(() => {
    if (bootstrapStarted) return;
    bootstrapStarted = true;

    (async () => {
      try {
        // Step 1: If Drive sync is not configured, surface a config error and
        // skip sign-in entirely (no functional sign-in wall without a client ID).
        if (!isConfigured()) {
          setConfigError(true);
          return;
        }

        // Step 2: Try a silent sign-in. Race against a 5s timeout so a hung
        // Google call can't pin the app on "Loading…".
        const silent = signInSilent();
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
        const user = await Promise.race([silent, timeout]);

        if (user) {
          // Silent sign-in succeeded — load Drive data and proceed to app.
          setDriveStatus('signed_in', user);
          const r = await loadFromDrive();
          if (r.ok) markSynced();

          const first = await isFirstLaunch();
          setNeedsOnboarding(first);
          setAuthRequired(false);
        } else {
          // No active session — show the sign-in wall.
          setAuthRequired(true);
        }
      } catch (err) {
        // Fail-safe: any unexpected error requires the user to sign in.
        console.error('Bootstrap error:', err);
        setAuthRequired(true);
      } finally {
        // Always finish bootstrap — never leave the user stuck on "Loading…"
        setBootstrapping(false);
      }

      // Step 3: Register DB write hooks exactly once per page load.
      // These run after the auth branch resolves so the auth outcome is settled.
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
    })();
  }, [setBootstrapping, setDriveStatus, markSynced, setNeedsOnboarding, setAuthRequired, setConfigError]);
}

// ─── Post-sign-in continuation ────────────────────────────────

async function handleSignInSuccess(user: DriveUser): Promise<void> {
  const { setDriveStatus, setAuthRequired, setNeedsOnboarding, showToast } = useAppUI.getState();

  setDriveStatus('signed_in', user);
  setAuthRequired(false);

  const result = await loadFromDrive();

  if (result.ok && !result.emptyRemote) {
    setNeedsOnboarding(false);
    showToast(`Welcome back, ${user.name}. Loaded data from Drive.`, 'success');
  } else if (result.ok && result.emptyRemote) {
    setNeedsOnboarding(true);
    showToast(`Signed in as ${user.email}. Choose how to set up your data.`, 'info');
  } else {
    // Drive load failed — route to onboarding setup cards.
    setNeedsOnboarding(true);
    showToast(`Signed in as ${user.email}. Choose how to set up your data.`, 'info');
  }
}

// ─── AuthGate ─────────────────────────────────────────────────

function AuthGate() {
  const authRequired = useAppUI(s => s.authRequired);
  if (authRequired) {
    return <GoogleSignInWall onSuccess={handleSignInSuccess} />;
  }
  return null;
}

// ─── OnboardingGate ───────────────────────────────────────────

function OnboardingGate() {
  const needsOnboarding = useAppUI(s => s.needsOnboarding);
  const location = useLocation();
  if (needsOnboarding && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  return null;
}

// ─── App ──────────────────────────────────────────────────────

export default function App() {
  const [configError, setConfigError] = useState(false);
  useBootstrap(setConfigError);
  const isBootstrapping = useAppUI(s => s.isBootstrapping);
  const authRequired = useAppUI(s => s.authRequired);

  if (isBootstrapping) {
    return (
      <div className="h-full grid place-items-center text-ink-400">
        <div className="text-center">
          <div className="animate-pulse text-lg mb-2">Loading…</div>
          <div className="text-xs">Checking for cloud sync</div>
        </div>
      </div>
    );
  }

  if (configError) {
    return (
      <div className="h-full grid place-items-center bg-paper-50 text-ink-900">
        <div className="text-center max-w-sm px-6">
          <div className="flex justify-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-danger/20 text-danger grid place-items-center text-2xl select-none">
              ⚠
            </div>
          </div>
          <h1 className="text-xl font-bold mb-3">Configuration Error</h1>
          <p className="text-sm text-ink-400 leading-relaxed">
            <code className="text-ink-700 bg-white px-1 py-0.5 rounded text-xs">VITE_GOOGLE_OAUTH_CLIENT_ID</code>{' '}
            is not set. Set this environment variable and rebuild the app to enable Google Sign-In.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <AuthGate />
      {!authRequired && (
        <>
          <OnboardingGate />
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
      )}
    </>
  );
}
