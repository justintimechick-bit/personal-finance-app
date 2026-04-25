import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, seedDatabase } from '../db';
import { useAppUI } from '../store/useAppStore';
import { ImportPreview } from '../components/ImportPreview';
import { parseXlsx, commitImport, type ImportPreview as ImportPreviewData } from '../sync/xlsxImport';

export default function Onboarding() {
  const navigate = useNavigate();
  const { showToast } = useAppUI();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreviewData | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  async function handleSeed() {
    await seedDatabase();
    showToast('Sample data loaded.', 'success');
    setTimeout(() => navigate('/'), 400);
  }

  async function handleFromScratch() {
    // Mark wiped so the next bootstrap doesn't re-seed.
    await db.meta.put({ key: 'wiped', value: true });
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
      showToast('Import complete. Loading…', 'success');
      setTimeout(() => window.location.assign('/'), 600);
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
