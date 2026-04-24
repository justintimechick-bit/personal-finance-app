import { useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { resetDatabase, wipeDatabase } from '../db/seed';
import { Section, CurrencyInput } from '../components/UI';
import { useAppUI } from '../store/useAppStore';
import {
  fileSyncSupported, pickNewFile, openExistingFile, clearFileHandle,
  writeToFile, downloadBackup, uploadBackup,
} from '../sync/fileSync';

export default function Settings() {
  const settings = useLiveQuery(() => db.settings.get(1), []);
  const { fileStatus, fileName, setFileStatus, showToast, markSaved } = useAppUI();
  const uploadRef = useRef<HTMLInputElement>(null);

  if (!settings) return <div className="text-ink-300">Loading…</div>;

  const supported = fileSyncSupported();

  async function handlePickFile() {
    const res = await pickNewFile();
    if (res.ok) {
      setFileStatus('linked', res.name);
      markSaved();
      showToast(`Linked to ${res.name}`, 'success');
    } else if (res.reason !== 'cancelled') {
      showToast(`Could not link file: ${res.reason}`, 'error');
    }
  }

  async function handleOpenFile() {
    const res = await openExistingFile();
    if (res.ok) {
      setFileStatus('linked', res.name);
      markSaved();
      showToast(`Opened ${res.name}`, 'success');
    } else if (res.reason !== 'cancelled') {
      showToast(`Could not open file: ${res.reason}`, 'error');
    }
  }

  async function handleUnlinkFile() {
    if (!confirm('Unlink the current file? Data stays in your browser but will no longer auto-save to disk.')) return;
    await clearFileHandle();
    setFileStatus('none', null);
    showToast('File unlinked', 'info');
  }

  async function handleForceSave() {
    const res = await writeToFile();
    if (res.ok) {
      markSaved();
      showToast('Saved', 'success');
    } else {
      showToast(`Save failed: ${res.reason}`, 'error');
    }
  }

  async function handleDownload() {
    await downloadBackup();
    showToast('Download started', 'success');
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('Importing will REPLACE all current data. Continue?')) {
      e.target.value = '';
      return;
    }
    const res = await uploadBackup(file);
    if (res.ok) {
      showToast('Import complete. Reloading…', 'success');
      setTimeout(() => window.location.reload(), 1000);
    } else {
      showToast(`Import failed: ${res.reason}`, 'error');
    }
    e.target.value = '';
  }

  async function handleReset() {
    if (!confirm('Reset to initial seed data? This wipes all paycheck history and balance changes.')) return;
    if (!confirm('Really? This cannot be undone.')) return;
    await resetDatabase();
    showToast('Reset complete. Reloading…', 'info');
    setTimeout(() => window.location.reload(), 800);
  }

  async function handleWipe() {
    if (!confirm('Wipe ALL data to a completely empty workspace? No seed data, no sample accounts. You will start from scratch.')) return;
    if (!confirm('Really? This cannot be undone.')) return;
    await wipeDatabase();
    showToast('Wiped. Reloading…', 'info');
    setTimeout(() => window.location.reload(), 800);
  }

  async function updateSetting(field: string, value: any) {
    await db.settings.update(1, { [field]: value });
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Settings</h1>
      <div className="text-sm text-ink-300 mb-6">File sync, app preferences, and data management.</div>

      <Section title="Local File Sync">
        <div className="card p-5">
          {!supported && (
            <div className="text-sm text-warn mb-3">
              ⚠️ This browser does not support the File System Access API. Use Chrome or Edge on your Mac for full file-sync support. You can still use download/upload as a fallback below.
            </div>
          )}

          <div className="flex items-center gap-3 mb-4">
            <div className={`w-3 h-3 rounded-full ${
              fileStatus === 'linked' ? 'bg-accent' :
              fileStatus === 'needs_permission' ? 'bg-warn' :
              'bg-ink-400'
            }`} />
            <div className="flex-1">
              {fileStatus === 'linked' ? (
                <>
                  <div className="font-medium">Linked to <span className="text-accent">{fileName}</span></div>
                  <div className="text-xs text-ink-300">Every change auto-saves. Put this file in iCloud Drive or Dropbox for cross-device sync.</div>
                </>
              ) : fileStatus === 'needs_permission' ? (
                <>
                  <div className="font-medium text-warn">Permission needed</div>
                  <div className="text-xs text-ink-300">Re-grant access to your file.</div>
                </>
              ) : (
                <>
                  <div className="font-medium">No file linked</div>
                  <div className="text-xs text-ink-300">Your data lives only in this browser. Link a file to auto-save to disk.</div>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {fileStatus === 'linked' ? (
              <>
                <button className="btn-ghost" onClick={handleForceSave}>Save now</button>
                <button className="btn-ghost" onClick={handleUnlinkFile}>Unlink</button>
              </>
            ) : (
              <>
                <button className="btn-primary" onClick={handlePickFile} disabled={!supported}>Create new file…</button>
                <button className="btn-ghost" onClick={handleOpenFile} disabled={!supported}>Open existing file…</button>
              </>
            )}
          </div>
        </div>
      </Section>

      <Section title="Manual Backup">
        <div className="card p-5">
          <div className="text-sm text-ink-300 mb-4">Download or restore a JSON snapshot.</div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={handleDownload}>Download backup</button>
            <button className="btn-ghost" onClick={() => uploadRef.current?.click()}>Upload backup…</button>
            <input ref={uploadRef} type="file" accept=".json" className="hidden" onChange={handleUpload} />
          </div>
        </div>
      </Section>

      <Section title="App Preferences">
        <div className="text-xs text-ink-300 mb-3">These values feed the suggestion math (tier waterfall, savings-rate goal). They never move money on their own — Payday is always manual.</div>
        <div className="card p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-ink-300 mb-1">CC Reserve Buffer</label>
            <CurrencyInput value={settings.ccReserveBuffer} onChange={v => updateSetting('ccReserveBuffer', v)} />
            <div className="text-xs text-ink-400 mt-1">Tier 0 (CC Float Reserve) suggests keeping CC balance + this buffer in checking. Only affects the "Suggested" hint on Payday.</div>
          </div>
          <div>
            <label className="block text-xs text-ink-300 mb-1">Target Savings Rate</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              className="input tabular"
              value={settings.targetSavingsRate}
              onChange={e => updateSetting('targetSavingsRate', parseFloat(e.target.value) || 0)}
            />
            <div className="text-xs text-ink-400 mt-1">Goal for the Dashboard "Savings rate YTD" bar. 0.5 = 50%. The bar turns green when you hit target. Savings = all paycheck allocations that didn't land in a checking account, divided by YTD net pay.</div>
          </div>
          <div>
            <label className="block text-xs text-ink-300 mb-1">Roth Contribution Year</label>
            <input
              type="number"
              className="input tabular"
              value={settings.rothContributionYear}
              onChange={e => updateSetting('rothContributionYear', parseInt(e.target.value) || new Date().getFullYear())}
            />
            <div className="text-xs text-ink-400 mt-1">Which tax year Roth contributions count against (important Jan–Apr when contributions can still apply to last year).</div>
          </div>
          <div>
            <label className="block text-xs text-ink-300 mb-1">Roth Annual Cap</label>
            <CurrencyInput value={settings.rothAnnualCap} onChange={v => updateSetting('rothAnnualCap', v)} />
            <div className="text-xs text-ink-400 mt-1">IRS Roth IRA contribution limit. Feeds the Roth tier's cap so the suggestion stops at the legal max. Update each year when the IRS raises the limit.</div>
          </div>
        </div>
      </Section>

      <Section title="Danger Zone">
        <div className="card p-5 border-danger/30 space-y-4">
          <div>
            <div className="text-sm text-ink-300 mb-2">Reset to the initial seed template (Chase Checking, Apple Savings, the tier waterfall, etc.). Wipes paycheck history and balance changes.</div>
            <button className="btn-danger" onClick={handleReset}>Reset to seed data</button>
          </div>
          <div className="pt-4 border-t border-ink-700">
            <div className="text-sm text-ink-300 mb-2">Wipe everything to a truly empty workspace — no accounts, liabilities, tiers, or expenses. Use this to start a simulation from scratch.</div>
            <button className="btn-danger" onClick={handleWipe}>Wipe all data (empty)</button>
          </div>
        </div>
      </Section>
    </div>
  );
}
