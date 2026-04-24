import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { fmt, fmtDate } from '../core/dates';
import { Money, Section, CurrencyInput } from '../components/UI';
import { scheduleAutoSave } from '../sync/fileSync';
import { useAppUI } from '../store/useAppStore';
import type { AccountType, LiabilityType } from '../types';

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'checking', label: 'Checking' },
  { value: 'hysa', label: 'HYSA' },
  { value: 'roth_ira', label: 'Roth IRA' },
  { value: 'brokerage', label: 'Brokerage' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

const LIABILITY_TYPES: { value: LiabilityType; label: string }[] = [
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'student_loan', label: 'Student Loan' },
  { value: 'auto_loan', label: 'Auto Loan' },
  { value: 'personal_loan', label: 'Personal Loan' },
  { value: 'other', label: 'Other' },
];

export default function Accounts() {
  const accountsRaw = useLiveQuery(() => db.accounts.toArray(), []);
  const liabilities = useLiveQuery(() => db.liabilities.toArray(), []);
  const { showToast } = useAppUI();
  const [editingAcctId, setEditingAcctId] = useState<number | null>(null);
  const [editingLiabId, setEditingLiabId] = useState<number | null>(null);

  if (!accountsRaw || !liabilities) return <div className="text-ink-300">Loading…</div>;

  const accounts = [...accountsRaw].sort((a, b) => {
    const ao = a.sortOrder ?? 1e9;
    const bo = b.sortOrder ?? 1e9;
    if (ao !== bo) return ao - bo;
    return a.id - b.id;
  });

  async function moveAccount(id: number, direction: -1 | 1) {
    // Materialize sort order for every account in its current displayed position,
    // then swap the target with its neighbor.
    const ordered = accounts.map((a, i) => ({ id: a.id, sortOrder: i }));
    const idx = ordered.findIndex(x => x.id === id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= ordered.length) return;
    [ordered[idx].sortOrder, ordered[swapIdx].sortOrder] = [ordered[swapIdx].sortOrder, ordered[idx].sortOrder];
    await db.transaction('rw', [db.accounts], async () => {
      for (const o of ordered) {
        await db.accounts.update(o.id, { sortOrder: o.sortOrder });
      }
    });
    scheduleAutoSave(500);
  }

  async function updateAccountBalance(id: number, balance: number) {
    await db.accounts.update(id, { balance, lastUpdated: new Date().toISOString().slice(0, 10) });
    scheduleAutoSave(500);
    setEditingAcctId(null);
    showToast('Balance updated', 'success');
  }

  async function updateAccountField(id: number, field: string, value: any) {
    await db.accounts.update(id, { [field]: value });
    scheduleAutoSave(500);
  }

  async function updateLiabilityBalance(id: number, balance: number) {
    await db.liabilities.update(id, { balance });
    scheduleAutoSave(500);
    setEditingLiabId(null);
    showToast('Liability updated', 'success');
  }

  async function updateLiabilityField(id: number, field: string, value: any) {
    await db.liabilities.update(id, { [field]: value });
    scheduleAutoSave(500);
  }

  async function addAccount() {
    const name = prompt('Account name?');
    if (!name) return;
    const maxSort = accounts.reduce((m, x) => Math.max(m, x.sortOrder ?? -1), -1);
    await db.accounts.add({
      name,
      institution: '',
      type: 'other',
      balance: 0,
      lastUpdated: new Date().toISOString().slice(0, 10),
      openedYet: true,
      sortOrder: maxSort + 1,
    } as any);
    scheduleAutoSave(500);
  }

  async function addLiability() {
    const name = prompt('Liability name?');
    if (!name) return;
    await db.liabilities.add({
      name,
      type: 'other',
      balance: 0,
      apr: 0,
      minimumPayment: 0,
      isRevolving: false,
      isActive: true,
    } as any);
    scheduleAutoSave(500);
  }

  async function deleteAccount(id: number) {
    if (!confirm('Delete this account?')) return;
    await db.accounts.delete(id);
    scheduleAutoSave(500);
  }

  async function deleteLiability(id: number) {
    if (!confirm('Delete this liability?')) return;
    await db.liabilities.delete(id);
    scheduleAutoSave(500);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Accounts &amp; Liabilities</h1>
      <div className="text-sm text-ink-300 mb-6">Update balances when they change. The app auto-updates after each paycheck.</div>

      <Section
        title="Accounts"
        action={<button className="btn-ghost" onClick={addAccount}>+ Add</button>}
      >
        <div className="text-xs text-ink-300 mb-3 space-y-1">
          <div>Your asset accounts. <strong>Type</strong> controls how balances roll up on the Dashboard and Trends page:</div>
          <ul className="list-disc ml-5 text-ink-400 space-y-0.5">
            <li><strong className="text-ink-200">Checking</strong> — the first checking account is the "primary": it receives paychecks and auto-pays Bank-Transfer fixed expenses. Counts toward <em>Liquid</em>.</li>
            <li><strong className="text-ink-200">HYSA / Cash</strong> — counts toward <em>Liquid</em>.</li>
            <li><strong className="text-ink-200">Roth IRA / Brokerage</strong> — counts toward <em>Invested</em>.</li>
            <li><strong className="text-ink-200">Other</strong> — doesn't roll into Liquid or Invested, but still appears on Payday.</li>
          </ul>
          <div>▲ ▼ reorders rows; this order drives the Payday allocation list. "Account is open" toggles whether a row shows on Payday (uncheck for accounts you haven't opened yet).</div>
        </div>
        <div className="card divide-y divide-ink-700">
          {accounts.map((a, i) => (
            <div key={a.id} className="p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex flex-col gap-0.5 pt-1">
                  <button
                    className="text-ink-400 hover:text-ink-50 disabled:opacity-20 disabled:cursor-not-allowed text-xs leading-none"
                    disabled={i === 0}
                    onClick={() => moveAccount(a.id, -1)}
                    aria-label="Move up"
                  >▲</button>
                  <button
                    className="text-ink-400 hover:text-ink-50 disabled:opacity-20 disabled:cursor-not-allowed text-xs leading-none"
                    disabled={i === accounts.length - 1}
                    onClick={() => moveAccount(a.id, 1)}
                    aria-label="Move down"
                  >▼</button>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      className="bg-transparent border-0 focus:outline-none font-medium text-ink-50 w-full md:w-auto"
                      value={a.name}
                      onChange={e => updateAccountField(a.id, 'name', e.target.value)}
                    />
                    <select
                      className="bg-ink-700 border border-ink-600 rounded px-2 py-0.5 text-xs"
                      value={a.type}
                      onChange={e => updateAccountField(a.id, 'type', e.target.value)}
                    >
                      {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    {a.openedYet === false && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-warn/20 text-warn">Not opened yet</span>
                    )}
                  </div>
                  <input
                    className="bg-transparent border-0 focus:outline-none text-xs text-ink-300 w-full md:w-auto"
                    value={a.institution ?? ''}
                    placeholder="Institution"
                    onChange={e => updateAccountField(a.id, 'institution', e.target.value)}
                  />
                </div>
                <div className="text-right">
                  {editingAcctId === a.id ? (
                    <div className="flex items-center gap-2">
                      <CurrencyInput
                        value={a.balance}
                        onChange={v => db.accounts.update(a.id, { balance: v })}
                        className="w-36"
                      />
                      <button className="btn-primary" onClick={() => updateAccountBalance(a.id, a.balance)}>Save</button>
                    </div>
                  ) : (
                    <button className="text-right hover:bg-ink-700 px-3 py-1.5 rounded-lg" onClick={() => setEditingAcctId(a.id)}>
                      <div className="text-xl font-semibold tabular"><Money amount={a.balance} /></div>
                      <div className="text-xs text-ink-300">Updated {fmtDate(a.lastUpdated)}</div>
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 text-xs">
                <label className="text-ink-300 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={a.openedYet !== false}
                    onChange={e => updateAccountField(a.id, 'openedYet', e.target.checked)}
                  />
                  Account is open
                </label>
                <button className="text-danger/80 hover:text-danger" onClick={() => deleteAccount(a.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Liabilities"
        action={<button className="btn-ghost" onClick={addLiability}>+ Add</button>}
      >
        <div className="text-xs text-ink-300 mb-3">
          Debts. All active liabilities sum into <em>Total Debt</em> on the Dashboard and Trends. <strong className="text-ink-200">Credit cards</strong> are split out as their own line on Trends, and the <strong>Due date</strong> drives the CC runway warning on Payday (flags if next checking balance can't cover the statement).
        </div>
        <div className="card divide-y divide-ink-700">
          {liabilities.map(l => (
            <div key={l.id} className="p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      className="bg-transparent border-0 focus:outline-none font-medium text-ink-50"
                      value={l.name}
                      onChange={e => updateLiabilityField(l.id, 'name', e.target.value)}
                    />
                    <select
                      className="bg-ink-700 border border-ink-600 rounded px-2 py-0.5 text-xs"
                      value={l.type}
                      onChange={e => updateLiabilityField(l.id, 'type', e.target.value)}
                    >
                      {LIABILITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    {!l.isActive && <span className="text-xs px-2 py-0.5 rounded-full bg-ink-700 text-ink-300">Inactive</span>}
                  </div>
                  <div className="text-xs text-ink-300 mt-1 flex flex-wrap gap-3">
                    <label className="flex items-center gap-1">
                      APR:
                      <input
                        type="number"
                        step="0.01"
                        className="w-16 bg-transparent border-b border-ink-600 focus:outline-none"
                        value={l.apr}
                        onChange={e => updateLiabilityField(l.id, 'apr', parseFloat(e.target.value) || 0)}
                      />%
                    </label>
                    <label className="flex items-center gap-1">
                      Min:
                      <input
                        type="number"
                        step="0.01"
                        className="w-20 bg-transparent border-b border-ink-600 focus:outline-none"
                        value={l.minimumPayment}
                        onChange={e => updateLiabilityField(l.id, 'minimumPayment', parseFloat(e.target.value) || 0)}
                      />
                    </label>
                    <label className="flex items-center gap-1">
                      Due:
                      <input
                        type="date"
                        className="bg-transparent border-b border-ink-600 focus:outline-none"
                        value={l.dueDate ?? ''}
                        onChange={e => updateLiabilityField(l.id, 'dueDate', e.target.value)}
                      />
                    </label>
                  </div>
                </div>
                <div className="text-right">
                  {editingLiabId === l.id ? (
                    <div className="flex items-center gap-2">
                      <CurrencyInput
                        value={l.balance}
                        onChange={v => db.liabilities.update(l.id, { balance: v })}
                        className="w-36"
                      />
                      <button className="btn-primary" onClick={() => updateLiabilityBalance(l.id, l.balance)}>Save</button>
                    </div>
                  ) : (
                    <button className="text-right hover:bg-ink-700 px-3 py-1.5 rounded-lg" onClick={() => setEditingLiabId(l.id)}>
                      <div className="text-xl font-semibold tabular text-warn"><Money amount={l.balance} /></div>
                      <div className="text-xs text-ink-300">Click to edit</div>
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 text-xs">
                <label className="text-ink-300 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={l.isActive}
                    onChange={e => updateLiabilityField(l.id, 'isActive', e.target.checked)}
                  />
                  Active
                </label>
                <button className="text-danger/80 hover:text-danger" onClick={() => deleteLiability(l.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
