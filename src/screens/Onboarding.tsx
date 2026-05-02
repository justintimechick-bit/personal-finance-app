import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, seedDatabase } from '../db';
import { useAppUI } from '../store/useAppStore';
import { ImportPreview } from '../components/ImportPreview';
import { parseXlsx, commitImport, type ImportPreview as ImportPreviewData } from '../sync/xlsxImport';
import { isConfigured, signIn, loadFromDrive, saveToDrive } from '../sync/driveSync';

export default function Onboarding() {
  const navigate = useNavigate();
  const { showToast, driveStatus, driveUser, setDriveStatus, markSynced, setNeedsOnboarding } = useAppUI();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreviewData | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const oauthConfigured = isConfigured();
  const isSignedIn = driveStatus === 'signed_in';

  // After any local DB change, push to Drive if signed in. Centralizes the
  // post-write logic so we never accidentally lose a write to the auto-save
  // debounce or a page reload.
  async function pushToDrive(): Promise<{ ok: boolean; reason?: string }> {
    if (!isSignedIn) return { ok: true };
    const r = await saveToDrive();
    if (r.ok) markSynced();
    return r;
  }

  async function handleGoogleSignIn() {
    setSigningIn(true);
    try {
      const user = await signIn();
      setDriveStatus('signed_in', user);
      // Pull any existing remote data first.
      const load = await loadFromDrive();
      if (load.ok && !load.emptyRemote) {
        markSynced();
        setNeedsOnboarding(false);
        showToast(`Welcome back, ${user.name}. Loaded data from Drive.`, 'success');
        setTimeout(() => navigate('/'), 600);
      } else {
        // Brand-new account on Drive — stay on Onboarding so the user can pick
        // a setup option. The signed-in banner replaces the sign-in callout
        // above the cards.
        await db.meta.put({ key: 'wiped', value: true });
        showToast(`Signed in as ${user.email}. Now choose how to set up your data.`, 'info');
      }
    } catch (err: any) {
      if (!/cancelled/i.test(String(err?.message))) {
        showToast(`Sign-in failed: ${err?.message ?? String(err)}`, 'error');
      }
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSeed() {
    await seedDatabase();
    const sync = await pushToDrive();
    if (!sync.ok) {
      showToast(`Sample loaded, but Drive sync failed: ${sync.reason}`, 'error');
      return;
    }
    setNeedsOnboarding(false);
    showToast(isSignedIn ? 'Sample data loaded. Synced to Drive.' : 'Sample data loaded.', 'success');
    setTimeout(() => navigate('/'), 400);
  }

  async function handleFromScratch() {
    // Mark wiped so the next bootstrap doesn't re-seed.
    await db.meta.put({ key: 'wiped', value: true });
    const sync = await pushToDrive();
    if (!sync.ok) {
      showToast(`Started fresh, but Drive sync failed: ${sync.reason}`, 'error');
      return;
    }
    setNeedsOnboarding(false);
    showToast('Starting fresh — add your accounts and expenses to get going.', 'info');
    setTimeout(() => navigate('/accounts'), 400);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setParsing(true);
    try {
      const parsed = await parseXlsx(file);
      setPreview(parsed);
    } catch (err) {
      console.error('Parse failed', err);
      showToast(`Could not read file: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setParsing(false);
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    setImporting(true);
    try {
      await commitImport(preview);
      const sync = await pushToDrive();
      if (!sync.ok) {
        showToast(`Imported, but Drive sync failed: ${sync.reason}`, 'error');
        setImporting(false);
        return;
      }
      setNeedsOnboarding(false);
      showToast(isSignedIn ? 'Import complete. Synced to Drive.' : 'Import complete.', 'success');
      setTimeout(() => navigate('/'), 400);
    } catch (err) {
      console.error('Import failed', err);
      showToast(`Import failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
      setImporting(false);
    }
  }

  return (
    <div className="min-h-full bg-ink-900 text-ink-50">
      <div className="max-w-4xl mx-auto p-6 md:p-10">
        <h1 className="text-3xl font-semibold mb-1">Welcome to Finance</h1>
        <div className="text-sm text-ink-300 mb-8">Pick how you'd like to set up your data. You can change anything later.</div>

        {/* Sign-in CTA (signed out) — recommended path */}
        {!preview && oauthConfigured && !isSignedIn && (
          <div className="card p-6 mb-4 border-accent/30 bg-accent/5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-[260px]">
                <div className="text-lg font-semibold mb-1">Sign in with Google <span className="text-[10px] uppercase tracking-wider text-accent ml-1">recommended</span></div>
                <div className="text-xs text-ink-300 leading-relaxed">
                  Your data syncs automatically to a single JSON file in your Google Drive (<code>finance-app-data.json</code>). Open the app on any browser, sign in with the same Google account, and your numbers follow.
                </div>
              </div>
              <button
                className="btn-primary"
                disabled={signingIn}
                onClick={handleGoogleSignIn}
              >
                {signingIn ? 'Signing in…' : 'Continue with Google'}
              </button>
            </div>
          </div>
        )}

        {/* Signed-in confirmation (signed in, fresh Drive) — pick a setup path next */}
        {!preview && isSignedIn && driveUser && (
          <div className="card p-6 mb-4 border-accent/40 bg-accent/10">
            <div className="flex items-center gap-3 flex-wrap">
              {driveUser.pictureUrl && (
                <img src={driveUser.pictureUrl} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full" />
              )}
              <div className="flex-1 min-w-[200px]">
                <div className="text-sm font-semibold">Signed in as {driveUser.email}</div>
                <div className="text-xs text-ink-300 mt-0.5">Now pick how to set up your data — your choice will sync to Drive immediately.</div>
              </div>
            </div>
          </div>
        )}

        {!preview ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button onClick={handleSeed} className="card p-6 text-left hover:bg-ink-700/30 transition-colors">
              <div className="text-lg font-semibold mb-2">Use sample template</div>
              <div className="text-xs text-ink-300 leading-relaxed">
                Loads a realistic example: a few accounts, a credit card, a student loan, biweekly paycheck, and typical fixed expenses. Best for trying out the app before committing.
              </div>
            </button>

            <div className="card p-6 flex flex-col">
              <div className="text-lg font-semibold mb-2">Import from Excel</div>
              <div className="text-xs text-ink-300 leading-relaxed mb-4 flex-1">
                Download the template, fill it out in Excel, Numbers, or Google Sheets, then upload it back. Best if you already have your numbers somewhere.
              </div>
              <a
                href="/finance-setup-template.xlsx"
                download
                className="btn-ghost text-xs mb-2 text-center"
              >
                Download template (.xlsx)
              </a>
              <button
                className="btn-primary text-xs"
                disabled={parsing}
                onClick={() => fileRef.current?.click()}
              >
                {parsing ? 'Reading file…' : 'Upload filled file…'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={handleFile}
              />
            </div>

            <button onClick={handleFromScratch} className="card p-6 text-left hover:bg-ink-700/30 transition-colors">
              <div className="text-lg font-semibold mb-2">Start from scratch</div>
              <div className="text-xs text-ink-300 leading-relaxed">
                Empty workspace. You'll add accounts, liabilities, and expenses one at a time from the Accounts and Manage screens.
              </div>
            </button>
          </div>
        ) : (
          <ImportPreview
            preview={preview}
            onConfirm={handleConfirm}
            onCancel={() => setPreview(null)}
            busy={importing}
          />
        )}
      </div>
    </div>
  );
}
