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

  const sections = [
    { label: 'Accounts', sheet: preview.accounts },
    { label: 'Liabilities', sheet: preview.liabilities },
    { label: 'Income sources', sheet: preview.incomeSources },
    { label: 'Fixed expenses', sheet: preview.fixedExpenses },
    { label: 'Tiers', sheet: preview.tiers },
  ];

  return (
    <div className="card p-5 space-y-4">
      <div>
        <div className="text-sm font-medium text-ink-50 mb-2">Preview</div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {sections.map(s => {
            const ok = s.sheet.errors.length === 0;
            return (
              <div key={s.label} className={`p-3 rounded-lg border ${ok ? 'border-ink-700 bg-ink-800/40' : 'border-danger/40 bg-danger/10'}`}>
                <div className="text-xs uppercase tracking-wider text-ink-300">{s.label}</div>
                <div className="text-xl font-semibold tabular mt-1">{s.sheet.valid.length}</div>
                <div className="text-[11px] text-ink-400">
                  {ok ? 'all rows valid' : `${s.sheet.errors.length} error${s.sheet.errors.length === 1 ? '' : 's'}`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {blocked && (
        <div className="border border-danger/40 bg-danger/10 rounded-lg p-3">
          <div className="text-sm font-medium text-danger mb-2">Validation errors — fix in your file and re-upload:</div>
          <ul className="text-xs space-y-1 max-h-60 overflow-y-auto">
            {preview.hardErrors.map((e, i) => (
              <li key={`h-${i}`} className="text-ink-200">
                <span className="font-medium">{e.sheet}</span>{e.row > 0 ? `!row ${e.row}` : ''}: {e.message}
              </li>
            ))}
            {sections.flatMap(s => s.sheet.errors).map((e, i) => (
              <li key={`s-${i}`} className="text-ink-200">
                <span className="font-medium">{e.sheet}</span>!row {e.row}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!blocked && (
        <div className="text-xs text-ink-300">
          Confirming will <strong>replace all current data</strong> with the contents of this file.
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button className="btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn-primary" onClick={onConfirm} disabled={blocked || busy}>
          {busy ? 'Importing…' : 'Confirm import'}
        </button>
      </div>
    </div>
  );
}
