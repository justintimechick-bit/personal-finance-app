import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { resetDatabase, wipeDatabase } from '../db/seed';
import { Cell, Tag, CurrencyInput } from '../components/UI';
import { useAppUI } from '../store/useAppStore';
import {
  isConfigured, signIn, signOut, saveToDrive, loadFromDrive,
  downloadBackup, uploadBackup,
} from '../sync/driveSync';
import { parseXlsx, commitImport, type ImportPreview as ImportPreviewData } from '../sync/xlsxImport';
import { ImportPreview } from '../components/ImportPreview';

export default function Settings() {
  const settings = useLiveQuery(() => db.settings.get(1), []);
  const { driveStatus, driveUser, setDriveStatus, showToast, markSynced } = useAppUI();
  const uploadRef = useRef<HTMLInputElement>(null);
  const xlsxRef = useRef<HTMLInputElement>(null);
  const [xlsxPreview, setXlsxPreview] = useState<ImportPreviewData | null>(null);
  const [xlsxParsing, setXlsxParsing] = useState(false);
  const [xlsxImporting, setXlsxImporting] = useState(false);

  if (!settings) return <div className="text-ink-200 p-8">Loading…</div>;

  const oauthConfigured = isConfigured();
  const signedIn = driveStatus === 'signed_in';

  async function handleSignIn() {
    try {
      const user = await signIn();
      setDriveStatus('signed_in', user);
      // Pull existing remote data first; if empty, push our local state up.
      const load = await loadFromDrive();
      if (load.ok && !load.emptyRemote) {
        markSynced();
        showToast(`Signed in as ${user.email}. Loaded data from Drive.`, 'success');
      } else {
        const save = await saveToDrive();
        if (save.ok) { markSynced(); showToast(`Signed in as ${user.email}. Synced to Drive.`, 'success'); }
        else showToast(`Signed in but sync failed: ${save.reason}`, 'error');
      }
    } catch (err: any) {
      if (!/cancelled/i.test(String(err?.message))) {
        showToast(`Sign-in failed: ${err?.message ?? String(err)}`, 'error');
      }
    }
  }
  async function handleSignOut() {
    if (!confirm('Sign out? Your data stays in this browser; Drive sync stops.')) return;
    await signOut();
    setDriveStatus('signed_out', null);
    showToast('Signed out', 'info');
  }
  async function handleForceSave() {
    const res = await saveToDrive();
    if (res.ok) { markSynced(); showToast('Synced to Drive', 'success'); }
    else showToast(`Sync failed: ${res.reason}`, 'error');
  }
  async function handleDownload() { await downloadBackup(); showToast('Download started', 'success'); }
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    if (!confirm('Importing will REPLACE all current data. Continue?')) { e.target.value = ''; return; }
    const res = await uploadBackup(file);
    if (res.ok) {
      // uploadBackup already pushes to Drive when signed in; just refresh state.
      if (signedIn) markSynced();
      showToast('Import complete.', 'success');
    }
    else showToast(`Import failed: ${res.reason}`, 'error');
    e.target.value = '';
  }
  async function handleReset() {
    if (!confirm('Reset to initial seed data? This wipes all paycheck history and balance changes.')) return;
    if (!confirm('Really? This cannot be undone.')) return;
    await resetDatabase();
    if (signedIn) {
      const save = await saveToDrive();
      if (save.ok) markSynced();
    }
    showToast('Reset complete.', 'success');
  }
  async function handleXlsxFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setXlsxParsing(true);
    try { setXlsxPreview(await parseXlsx(file)); }
    catch (err) { console.error('Parse failed', err); showToast(`Could not read file: ${err instanceof Error ? err.message : String(err)}`, 'error'); }
    finally { setXlsxParsing(false); }
  }
  async function handleXlsxConfirm() {
    if (!xlsxPreview) return;
    if (!confirm('Replace ALL current data with the contents of this file?')) return;
    setXlsxImporting(true);
    try {
      await commitImport(xlsxPreview);
      // Push the freshly-imported data to Drive immediately so the auto-save
      // debounce (1.5s) can't lose it. Also avoids the previous reload-then-
      // load-from-Drive race that overwrote the import.
      if (signedIn) {
        const save = await saveToDrive();
        if (save.ok) markSynced();
        else {
          showToast(`Imported, but Drive sync failed: ${save.reason}`, 'error');
          setXlsxImporting(false);
          return;
        }
      }
      setXlsxPreview(null);
      setXlsxImporting(false);
      showToast(signedIn ? 'Import complete. Synced to Drive.' : 'Import complete.', 'success');
    }
    catch (err) {
      console.error('Import failed', err);
      showToast(`Import failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
      setXlsxImporting(false);
    }
  }
  async function handleWipe() {
    if (!confirm('Wipe ALL data to a completely empty workspace?')) return;
    if (!confirm('Really? This cannot be undone.')) return;
    await wipeDatabase();
    if (signedIn) {
      const save = await saveToDrive();
      if (save.ok) markSynced();
    }
    showToast('Wiped.', 'success');
    setTimeout(() => window.location.assign('/onboarding'), 600);
  }
  const updateSetting = async (field: string, value: any) => { await db.settings.update(1, { [field]: value }); };

  return (
    <>
      <div className="screen-header">
        <h1 className="screen-title">Settings</h1>
        <div className="screen-meta">Cloud sync, preferences, data management.</div>
      </div>

      {/* Cloud sync — green when signed in */}
      <Cell
        variant={signedIn ? 'green' : driveStatus === 'token_expired' ? 'warn' : 'default'}
        className="mb-2"
        helpTitle="Cloud Sync"
        help={<>
          <p>Stores a single JSON file (`finance-app-data.json`) in the root of your Google Drive. Every change in the app auto-syncs to that file with a 1.5-second debounce. Open the app on another browser, sign in with the same Google account, and your data follows you.</p>
          <p>The app uses the <code>drive.file</code> scope, so it can <strong>only</strong> see files it created — it has no access to anything else in your Drive.</p>
          <p>You can delete or share the file from drive.google.com at any time. Manual download/upload below is independent of cloud sync.</p>
        </>}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <Tag onGreen={signedIn}>Cloud Sync</Tag>
            <div className="flex items-center gap-2 mt-1">
              {signedIn && driveUser?.pictureUrl && (
                <img src={driveUser.pictureUrl} alt="" referrerPolicy="no-referrer" className="w-6 h-6 rounded-full" />
              )}
              <div className={`text-[14px] font-bold truncate ${signedIn ? 'text-black' : driveStatus === 'token_expired' ? 'text-warn' : 'text-ink-50'}`}>
                {signedIn ? (driveUser?.email ?? 'Signed in')
                 : driveStatus === 'token_expired' ? 'Re-sign in needed'
                 : oauthConfigured ? 'Not signed in'
                 : 'Cloud sync not configured'}
              </div>
            </div>
            <div className={`text-[11px] mt-0.5 ${signedIn ? '' : 'text-ink-200'}`} style={signedIn ? {color:'rgba(0,0,0,0.55)'} : {}}>
              {signedIn ? 'Auto-syncing on every change. File: finance-app-data.json in Drive.'
               : driveStatus === 'token_expired' ? 'Your Google session expired — sign back in to resume sync.'
               : oauthConfigured ? 'Sign in to sync this app across devices via your Google Drive.'
               : 'Set VITE_GOOGLE_OAUTH_CLIENT_ID in .env.local to enable cloud sync. See README → Google OAuth setup.'}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {signedIn ? (
              <>
                <button className="bg-black text-accent font-bold rounded-lg px-3 py-1.5 text-[12px] hover:bg-black/80" onClick={handleForceSave}>Sync now</button>
                <button className="bg-black/10 text-black font-bold rounded-lg px-3 py-1.5 text-[12px] hover:bg-black/20 border border-black/20" onClick={handleSignOut}>Sign out</button>
              </>
            ) : (
              <button className="btn-primary" onClick={handleSignIn} disabled={!oauthConfigured}>
                Sign in with Google
              </button>
            )}
          </div>
        </div>
      </Cell>

      {/* Preferences grid */}
      <div className="bento bento-2 mb-2">
        <Cell
          className="cell-flex cell-pad-sm"
          helpTitle="CC Reserve Buffer"
          help={<p>Used by the Tier 0 ("CC Float Reserve") suggestion only. The waterfall suggests keeping <strong>CC balance + this buffer</strong> in checking, so a small statement increase doesn't catch you short. Doesn't move money on its own — Payday is always manual.</p>}
        >
          <Tag>CC Reserve Buffer</Tag>
          <CurrencyInput value={settings.ccReserveBuffer} onChange={v => updateSetting('ccReserveBuffer', v)} />
          <div className="text-[10px] text-ink-200 mt-1">Tier 0 keeps CC balance + this buffer in checking.</div>
        </Cell>
        <Cell
          className="cell-flex cell-pad-sm"
          helpTitle="Target Savings Rate"
          help={<p>Decimal between 0 and 1 (0.3 = 30%). Drives the green/warn coloring on the Dashboard's Savings Rate YTD card and the "On track" indicator on Net Worth. Definition of "saved": every paycheck allocation that did <strong>not</strong> land in a checking account, divided by total YTD net pay applied.</p>}
        >
          <Tag>Target Savings Rate</Tag>
          <input type="number" step="0.01" min="0" max="1" className="input" value={settings.targetSavingsRate} onChange={e => updateSetting('targetSavingsRate', parseFloat(e.target.value) || 0)} />
          <div className="text-[10px] text-ink-200 mt-1">0.5 = 50%. Drives the Dashboard rate bar.</div>
        </Cell>
        <Cell
          className="cell-flex cell-pad-sm"
          helpTitle="Roth Contribution Year"
          help={<p>Which tax year your Roth contributions count toward. Matters Jan 1 → mid-April when you can still contribute to last year. Currently informational — Roth allocations are tracked in the tier waterfall against the calendar year of the paycheck date.</p>}
        >
          <Tag>Roth Contribution Year</Tag>
          <input type="number" className="input tabular" value={settings.rothContributionYear} onChange={e => updateSetting('rothContributionYear', parseInt(e.target.value) || new Date().getFullYear())} />
          <div className="text-[10px] text-ink-200 mt-1">Tax year contributions count against.</div>
        </Cell>
        <Cell
          className="cell-flex cell-pad-sm"
          helpTitle="Roth Annual Cap"
          help={<p>IRS Roth IRA contribution limit (e.g., $7,000 for 2026). Update each year when the IRS bumps it. Used as the cap on any Tier targeting your Roth account so the suggestion stops at the legal max.</p>}
        >
          <Tag>Roth Annual Cap</Tag>
          <CurrencyInput value={settings.rothAnnualCap} onChange={v => updateSetting('rothAnnualCap', v)} />
          <div className="text-[10px] text-ink-200 mt-1">IRS Roth IRA contribution limit.</div>
        </Cell>
      </div>

      {/* Bulk setup */}
      <Cell
        className="mb-2"
        helpTitle="Bulk Setup From File"
        help={<>
          <p>Replace your entire workspace with the contents of an Excel workbook. Useful for first-time setup, recovering from a wipe, or migrating from another tool.</p>
          <p>Workflow: download the template → fill it in → upload it → see a per-sheet validation preview → confirm. The template has a "KEY" block at the top of each sheet listing allowed enum values.</p>
          <p>Imports are all-or-nothing — if any row has an invalid enum or missing required field, the Confirm button stays disabled until you fix and re-upload.</p>
        </>}
      >
        <Tag>Bulk Setup From File</Tag>
        <div className="text-[10px] text-ink-200 mt-1 mb-3">Replace all data with an Excel workbook. Validation preview before anything is written.</div>
        {!xlsxPreview ? (
          <div className="flex flex-wrap gap-2">
            <a href="/finance-setup-template.xlsx" download className="btn-ghost">Download template (.xlsx)</a>
            <button className="btn-primary" disabled={xlsxParsing} onClick={() => xlsxRef.current?.click()}>
              {xlsxParsing ? 'Reading file…' : 'Upload filled file…'}
            </button>
            <input ref={xlsxRef} type="file" accept=".xlsx" className="hidden" onChange={handleXlsxFile} />
          </div>
        ) : (
          <ImportPreview preview={xlsxPreview} onConfirm={handleXlsxConfirm} onCancel={() => setXlsxPreview(null)} busy={xlsxImporting} />
        )}
      </Cell>

      {/* Manual backup */}
      <Cell className="mb-2">
        <Tag>Manual Backup</Tag>
        <div className="text-[10px] text-ink-200 mt-1 mb-3">JSON snapshot of all data.</div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={handleDownload}>Download backup</button>
          <button className="btn-ghost" onClick={() => uploadRef.current?.click()}>Upload backup…</button>
          <input ref={uploadRef} type="file" accept=".json" className="hidden" onChange={handleUpload} />
        </div>
      </Cell>

      {/* Danger zone */}
      <Cell className="cell-warn">
        <Tag>Danger Zone</Tag>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          <div>
            <div className="text-[11px] text-ink-100 mb-2">Reset to seed: wipes paycheck history and balance changes, restores Chase Checking / Apple Savings / tier waterfall.</div>
            <button className="btn-danger" onClick={handleReset}>Reset to seed data</button>
          </div>
          <div>
            <div className="text-[11px] text-ink-100 mb-2">Wipe everything to an empty workspace. No seed accounts. Start from scratch.</div>
            <button className="btn-danger" onClick={handleWipe}>Wipe all data (empty)</button>
          </div>
        </div>
      </Cell>
    </>
  );
}
