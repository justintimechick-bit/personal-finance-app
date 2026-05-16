import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { fmtDate } from '../core/dates';
import { Cell, Tag, Money, CurrencyInput } from '../components/UI';
import { scheduleAutoSave } from '../sync/driveSync';
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

  if (!accountsRaw || !liabilities) return <div className="text-ink-500 p-8">Loading…</div>;

  const accounts = [...accountsRaw].sort((a, b) => {
    const ao = a.sortOrder ?? 1e9, bo = b.sortOrder ?? 1e9;
    if (ao !== bo) return ao - bo;
    return a.id - b.id;
  });

  async function moveAccount(id: number, direction: -1 | 1) {
    const ordered = accounts.map((a, i) => ({ id: a.id, sortOrder: i }));
    const idx = ordered.findIndex(x => x.id === id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= ordered.length) return;
    [ordered[idx].sortOrder, ordered[swapIdx].sortOrder] = [ordered[swapIdx].sortOrder, ordered[idx].sortOrder];
    await db.transaction('rw', [db.accounts], async () => {
      for (const o of ordered) await db.accounts.update(o.id, { sortOrder: o.sortOrder });
    });
    scheduleAutoSave(500);
  }
  async function updateAccountBalance(id: number, balance: number) {
    await db.accounts.update(id, { balance, lastUpdated: new Date().toISOString().slice(0, 10) });
    scheduleAutoSave(500); setEditingAcctId(null); showToast('Balance updated', 'success');
  }
  const updateAccountField = async (id: number, field: string, value: any) => {
    await db.accounts.update(id, { [field]: value }); scheduleAutoSave(500);
  };
  async function updateLiabilityBalance(id: number, balance: number) {
    await db.liabilities.update(id, { balance });
    scheduleAutoSave(500); setEditingLiabId(null); showToast('Liability updated', 'success');
  }
  const updateLiabilityField = async (id: number, field: string, value: any) => {
    await db.liabilities.update(id, { [field]: value }); scheduleAutoSave(500);
  };
  async function addAccount() {
    const name = prompt('Account name?'); if (!name) return;
    const maxSort = accounts.reduce((m, x) => Math.max(m, x.sortOrder ?? -1), -1);
    await db.accounts.add({ name, institution: '', type: 'other', balance: 0, lastUpdated: new Date().toISOString().slice(0, 10), openedYet: true, sortOrder: maxSort + 1 } as any);
    scheduleAutoSave(500);
  }
  async function addLiability() {
    const name = prompt('Liability name?'); if (!name) return;
    await db.liabilities.add({ name, type: 'other', balance: 0, apr: 0, minimumPayment: 0, isRevolving: false, isActive: true } as any);
    scheduleAutoSave(500);
  }
  async function deleteAccount(id: number) { if (!confirm('Delete this account?')) return; await db.accounts.delete(id); scheduleAutoSave(500); }
  async function deleteLiability(id: number) { if (!confirm('Delete this liability?')) return; await db.liabilities.delete(id); scheduleAutoSave(500); }

  const totalAssets = accounts.reduce((s, a) => s + a.balance, 0);
  const totalLiab = liabilities.filter(l => l.isActive).reduce((s, l) => s + l.balance, 0);

  return (
    <>
      <div className="screen-header">
        <h1 className="screen-title">Accounts &amp; Liabilities</h1>
        <div className="screen-meta">{accounts.length} accounts · {liabilities.length} liabilities</div>
      </div>

      {/* Top summary row */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <Cell
          className="cell-pad-sm"
          helpTitle="Total Assets"
          help={<p>Sum of <strong>every account balance</strong>, regardless of type. Includes checking, HYSA, Roth, brokerage, cash, and "other".</p>}
        >
          <div className="flex items-baseline gap-2">
            <Tag>Total Assets</Tag>
            <div className="text-[18px] font-extrabold tabular text-accent-dim"><Money amount={totalAssets} showCents={false} /></div>
            <div className="text-[10px] text-ink-500">· {accounts.length} accounts</div>
          </div>
        </Cell>
        <Cell
          className="cell-pad-sm"
          helpTitle="Total Debt"
          help={<p>Sum of every <strong>active</strong> liability. Inactive ones (toggled off after payoff) are excluded. Pay down a debt by allocating to it on the Payday screen.</p>}
        >
          <div className="flex items-baseline gap-2">
            <Tag>Total Debt</Tag>
            <div className={`text-[18px] font-extrabold tabular ${totalLiab > 0 ? 'text-warn' : 'text-ink-900'}`}><Money amount={totalLiab} showCents={false} /></div>
            <div className="text-[10px] text-ink-500">· {liabilities.filter(l => l.isActive).length} active</div>
          </div>
        </Cell>
        <Cell
          className="cell-pad-sm"
          helpTitle="Net Worth"
          help={<p>Total Assets minus Total Debt. Identical to the value shown on the Dashboard hero card.</p>}
        >
          <div className="flex items-baseline gap-2">
            <Tag>Net Worth</Tag>
            <div className={`text-[18px] font-extrabold tabular ${totalAssets - totalLiab >= 0 ? 'text-ink-900' : 'text-danger'}`}>
              <Money amount={totalAssets - totalLiab} showCents={false} />
            </div>
            <div className="text-[10px] text-ink-500">· assets − debt</div>
          </div>
        </Cell>
      </div>

      {/* Accounts grid */}
      <Cell className="mb-2">
        <div className="flex items-center justify-between mb-2">
          <Tag>Accounts</Tag>
          <button className="btn-ghost" onClick={addAccount}>+ Account</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
          {accounts.map((a, i) => (
            <div key={a.id} className="bg-paper-100 border border-paper-300 rounded-cell p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5 pt-0.5 shrink-0">
                  <button className="text-ink-500 hover:text-ink-900 disabled:opacity-20 text-[10px] leading-none" disabled={i === 0} onClick={() => moveAccount(a.id, -1)}>▲</button>
                  <button className="text-ink-500 hover:text-ink-900 disabled:opacity-20 text-[10px] leading-none" disabled={i === accounts.length - 1} onClick={() => moveAccount(a.id, 1)}>▼</button>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <input className="bg-transparent border-0 focus:outline-none text-[13px] font-semibold text-ink-900 min-w-0 flex-1" value={a.name} onChange={e => updateAccountField(a.id, 'name', e.target.value)} />
                    <select className="bg-paper-200 border border-paper-400 rounded px-1.5 py-0.5 text-[10px]" value={a.type} onChange={e => updateAccountField(a.id, 'type', e.target.value)}>
                      {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    {a.openedYet === false && <span className="chip-warn">Not open</span>}
                  </div>
                  <input className="bg-transparent border-0 focus:outline-none text-[10px] text-ink-500 w-full" value={a.institution ?? ''} placeholder="Institution" onChange={e => updateAccountField(a.id, 'institution', e.target.value)} />
                </div>
                <div className="text-right shrink-0">
                  {editingAcctId === a.id ? (
                    <div className="flex items-center gap-1">
                      <CurrencyInput value={a.balance} onChange={v => db.accounts.update(a.id, { balance: v })} className="w-28" />
                      <button className="btn-primary" onClick={() => updateAccountBalance(a.id, a.balance)}>✓</button>
                    </div>
                  ) : (
                    <button className="text-right hover:bg-paper-200 px-2 py-1 rounded-lg" onClick={() => setEditingAcctId(a.id)}>
                      <div className="num-sm text-ink-900"><Money amount={a.balance} showCents={false} /></div>
                      <div className="text-[9px] text-ink-500">{fmtDate(a.lastUpdated)}</div>
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between mt-1.5 text-[10px]">
                <label className="text-ink-500 flex items-center gap-1.5">
                  <input type="checkbox" checked={a.openedYet !== false} onChange={e => updateAccountField(a.id, 'openedYet', e.target.checked)} />
                  Open
                </label>
                <button className="text-danger/80 hover:text-danger" onClick={() => deleteAccount(a.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </Cell>

      {/* Liabilities grid */}
      <Cell>
        <div className="flex items-center justify-between mb-2">
          <Tag>Liabilities</Tag>
          <button className="btn-ghost" onClick={addLiability}>+ Liability</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
          {liabilities.map(l => (
            <div key={l.id} className="bg-paper-100 border border-paper-300 rounded-cell p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <input className="bg-transparent border-0 focus:outline-none text-[13px] font-semibold text-ink-900 min-w-0 flex-1" value={l.name} onChange={e => updateLiabilityField(l.id, 'name', e.target.value)} />
                    <select className="bg-paper-200 border border-paper-400 rounded px-1.5 py-0.5 text-[10px]" value={l.type} onChange={e => updateLiabilityField(l.id, 'type', e.target.value)}>
                      {LIABILITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    {!l.isActive && <span className="chip-muted">Inactive</span>}
                  </div>
                  <div className="text-[10px] text-ink-500 mt-1 flex flex-wrap gap-2">
                    <label className="flex items-center gap-1">APR
                      <input type="number" step="0.01" className="w-12 bg-transparent border-b border-paper-400 focus:outline-none" value={l.apr} onChange={e => updateLiabilityField(l.id, 'apr', parseFloat(e.target.value) || 0)} />%
                    </label>
                    <label className="flex items-center gap-1">Min
                      <input type="number" step="0.01" className="w-16 bg-transparent border-b border-paper-400 focus:outline-none" value={l.minimumPayment} onChange={e => updateLiabilityField(l.id, 'minimumPayment', parseFloat(e.target.value) || 0)} />
                    </label>
                    <label className="flex items-center gap-1">Due
                      <input type="date" className="bg-transparent border-b border-paper-400 focus:outline-none" value={l.dueDate ?? ''} onChange={e => updateLiabilityField(l.id, 'dueDate', e.target.value)} />
                    </label>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {editingLiabId === l.id ? (
                    <div className="flex items-center gap-1">
                      <CurrencyInput value={l.balance} onChange={v => db.liabilities.update(l.id, { balance: v })} className="w-28" />
                      <button className="btn-primary" onClick={() => updateLiabilityBalance(l.id, l.balance)}>✓</button>
                    </div>
                  ) : (
                    <button className="text-right hover:bg-paper-200 px-2 py-1 rounded-lg" onClick={() => setEditingLiabId(l.id)}>
                      <div className="num-sm text-warn"><Money amount={l.balance} showCents={false} /></div>
                      <div className="text-[9px] text-ink-500">edit</div>
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between mt-1.5 text-[10px]">
                <label className="text-ink-500 flex items-center gap-1.5">
                  <input type="checkbox" checked={l.isActive} onChange={e => updateLiabilityField(l.id, 'isActive', e.target.checked)} />
                  Active
                </label>
                <button className="text-danger/80 hover:text-danger" onClick={() => deleteLiability(l.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </Cell>
    </>
  );
}
