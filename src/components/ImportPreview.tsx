import { useEffect } from 'react';
import type { ImportPreview as ImportPreviewData } from '../sync/xlsxImport';
import { hasErrors } from '../sync/xlsxImport';

interface Props {
  preview: ImportPreviewData;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}

export function ImportPreview({ preview, onConfirm, onCancel, busy }: Props) {
  const blocked = hasErrors(preview);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [busy, onCancel]);

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const sections = [
    { label: 'Accounts', sheet: preview.accounts },
    { label: 'Liabilities', sheet: preview.liabilities },
    { label: 'Income sources', sheet: preview.incomeSources },
    { label: 'Fixed expenses', sheet: preview.fixedExpenses },
    { label: 'Tiers', sheet: preview.tiers },
  ];

  const allRowErrors = [
    ...preview.hardErrors,
    ...sections.flatMap(s => s.sheet.errors),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/80 backdrop-blur-sm p-4">
      <div className="bg-ink-800 border border-ink-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-ink-700 flex items-center justify-between">
          <div>
            <div className="text-base font-semibold text-ink-50">Import preview</div>
            <div className="text-xs text-ink-300 mt-0.5">
              {blocked ? 'Validation errors must be fixed before import.' : 'Confirming will replace ALL current data.'}
            </div>
          </div>
          <button
            className="text-ink-400 hover:text-ink-50 text-xl leading-none px-2"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close"
          >×</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {sections.map(s => {
              const ok = s.sheet.errors.length === 0;
              return (
                <div key={s.label} className={`p-2 rounded-lg border ${ok ? 'border-ink-700 bg-ink-800/40' : 'border-danger/40 bg-danger/10'}`}>
                  <div className="text-[10px] uppercase tracking-wider text-ink-300">{s.label}</div>
                  <div className="text-lg font-semibold tabular mt-0.5">{s.sheet.valid.length}</div>
                  <div className="text-[10px] text-ink-400">
                    {ok ? 'all rows valid' : `${s.sheet.errors.length} error${s.sheet.errors.length === 1 ? '' : 's'}`}
                  </div>
                </div>
              );
            })}
          </div>

          {blocked && (
            <div className="border border-danger/40 bg-danger/10 rounded-lg p-3">
              <div className="text-xs font-medium text-danger mb-2">{allRowErrors.length} error{allRowErrors.length === 1 ? '' : 's'} — fix in your file and re-upload:</div>
              <ul className="text-xs space-y-1">
                {allRowErrors.map((e, i) => (
                  <li key={i} className="text-ink-200">
                    <span className="font-medium">{e.sheet}</span>{e.row > 0 ? ` · row ${e.row}` : ''}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer (always visible) */}
        <div className="px-5 py-3 border-t border-ink-700 flex justify-end gap-2 bg-ink-800 rounded-b-xl">
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn-primary" onClick={onConfirm} disabled={blocked || busy}>
            {busy ? 'Importing…' : 'Confirm import'}
          </button>
        </div>
      </div>
    </div>
  );
}
