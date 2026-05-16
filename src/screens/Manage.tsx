import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Cell, Tag, CurrencyInput } from '../components/UI';
import { scheduleAutoSave } from '../sync/driveSync';
import { useAppUI } from '../store/useAppStore';
import type { Cadence, ExpenseCategory, PaymentMethod, IncomeType, CapType, ResetCadence } from '../types';

type Tab = 'income' | 'expenses' | 'tiers';

const CADENCES: Cadence[] = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'annual', 'irregular'];
const CATEGORIES: ExpenseCategory[] = ['housing', 'food', 'transportation', 'insurance', 'debt', 'subscriptions', 'entertainment', 'health', 'misc'];
const PAYMENT_METHODS: PaymentMethod[] = ['Bank Transfer', 'Credit Card', 'Cash', 'Autopay', 'Other'];
const INCOME_TYPES: IncomeType[] = ['paycheck', 'bonus', 'gift', 'reimbursement', 'side_income', 'other'];
const CAP_TYPES: CapType[] = ['fixed', 'dynamic', 'unlimited'];
const RESET_CADENCES: ResetCadence[] = ['none', 'annual', 'monthly', 'per_statement'];

// Category accent colors
const CAT_COLOR: Record<ExpenseCategory, string> = {
  housing:        '#a78bfa',
  food:           '#fb923c',
  transportation: '#60a5fa',
  insurance:      '#f59e0b',
  debt:           '#ef4444',
  subscriptions:  '#ec4899',
  entertainment:  '#4ade80',
  health:         '#22d3ee',
  misc:           '#71717a',
};

export default function Manage() {
  const [tab, setTab] = useState<Tab>('expenses');

  return (
    <>
      <div className="screen-header">
        <h1 className="screen-title">Manage</h1>
        <div className="screen-meta">Configure income, expenses, and the allocation waterfall.</div>
      </div>

      {/* Segmented tabs as bento cell */}
      <Cell className="cell-pad-sm mb-2">
        <div className="flex gap-1">
          {(['income', 'expenses', 'tiers'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 px-3 py-1.5 text-[12px] font-bold capitalize rounded-lg transition-colors ${
                tab === t ? 'bg-accent text-ink-900' : 'text-ink-500 hover:bg-paper-100'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </Cell>

      {tab === 'income' && <IncomeTab />}
      {tab === 'expenses' && <ExpensesTab />}
      {tab === 'tiers' && <TiersTab />}
    </>
  );
}

function IncomeTab() {
  const items = useLiveQuery(() => db.incomeSources.toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const { showToast } = useAppUI();
  if (!items || !accounts) return null;

  const update = async (id: number, field: string, value: any) => { await db.incomeSources.update(id, { [field]: value }); scheduleAutoSave(500); };
  const add = async () => { await db.incomeSources.add({ name: 'New income source', sourceType: 'other', amount: 0, cadence: 'monthly', depositAccount: accounts?.[0]?.name ?? '', isActive: true } as any); scheduleAutoSave(500); };
  const remove = async (id: number) => { if (!confirm('Delete this income source?')) return; await db.incomeSources.delete(id); scheduleAutoSave(500); showToast('Deleted', 'success'); };

  return (
    <Cell>
      <div className="flex items-center justify-between mb-3">
        <Tag>Income Sources — {items.length}</Tag>
        <button className="btn-ghost" onClick={add}>+ Add</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {items.map(i => (
          <div key={i.id} className="bg-paper-100 border border-paper-300 rounded-cell p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <input className="bg-transparent border-0 focus:outline-none text-[13px] font-semibold text-ink-900 flex-1 min-w-0" value={i.name} onChange={e => update(i.id, 'name', e.target.value)} />
              <CurrencyInput value={i.amount} onChange={v => update(i.id, 'amount', v)} className="w-28" />
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-[10px] text-ink-500">
              <select className="bg-paper-200 border border-paper-400 rounded px-1.5 py-1 text-[10px]" value={i.sourceType} onChange={e => update(i.id, 'sourceType', e.target.value)}>
                {INCOME_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className="bg-paper-200 border border-paper-400 rounded px-1.5 py-1 text-[10px]" value={i.cadence} onChange={e => update(i.id, 'cadence', e.target.value)}>
                {CADENCES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="bg-paper-200 border border-paper-400 rounded px-1.5 py-1 text-[10px]" value={i.depositAccount} onChange={e => update(i.id, 'depositAccount', e.target.value)}>
                {accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between mt-2 text-[10px]">
              <label className="text-ink-500 flex items-center gap-1.5">
                <input type="checkbox" checked={i.isActive} onChange={e => update(i.id, 'isActive', e.target.checked)} />
                Active
              </label>
              <button className="text-danger/80 hover:text-danger" onClick={() => remove(i.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </Cell>
  );
}

function ExpensesTab() {
  const items = useLiveQuery(() => db.fixedExpenses.toArray(), []);
  const { showToast } = useAppUI();
  if (!items) return null;

  const update = async (id: number, field: string, value: any) => { await db.fixedExpenses.update(id, { [field]: value }); scheduleAutoSave(500); };
  const add = async () => { await db.fixedExpenses.add({ name: 'New expense', category: 'misc', amount: 0, cadence: 'monthly', paymentMethod: 'Credit Card', isActive: true } as any); scheduleAutoSave(500); };
  const remove = async (id: number) => { if (!confirm('Delete this expense?')) return; await db.fixedExpenses.delete(id); scheduleAutoSave(500); showToast('Deleted', 'success'); };

  const monthlyTotal = items.filter(e => e.isActive).reduce((s, e) => {
    const perYear = e.cadence === 'monthly' ? e.amount * 12 :
                    e.cadence === 'biweekly' ? e.amount * 26 :
                    e.cadence === 'weekly' ? e.amount * 52 :
                    e.cadence === 'annual' ? e.amount :
                    e.cadence === 'quarterly' ? e.amount * 4 :
                    e.cadence === 'semimonthly' ? e.amount * 24 : 0;
    return s + perYear / 12;
  }, 0);

  const bankTransferCount = items.filter(e => e.isActive && e.paymentMethod === 'Bank Transfer').length;

  return (
    <>
      <div className="bento bento-4 mb-2">
        <Cell
          variant="green"
          className="cell-flex cell-pad-sm"
          helpTitle="Total Monthly"
          help={<p>Every active fixed expense, normalized to a monthly amount (a $300/biweekly bill counts as ~$650/mo). Includes all payment methods. Same number you see as "Monthly Out" on the Dashboard.</p>}
        >
          <Tag onGreen>Total Monthly</Tag>
          <div className="num-md text-black">${Math.round(monthlyTotal).toLocaleString()}</div>
          <div className="text-[10px]" style={{color:'rgba(0,0,0,0.5)'}}>{items.filter(e => e.isActive).length} active</div>
        </Cell>
        <Cell
          className="cell-flex cell-pad-sm"
          helpTitle="Bank Transfer count"
          help={<p>How many active expenses use the <strong>Bank Transfer</strong> payment method. Each one carves a slice out of every paycheck — they're the basis for the "Checking reserve" amount on Payday. Switch one to Credit Card or Autopay if you don't want it leaving checking that period.</p>}
        >
          <Tag>Bank Transfer</Tag>
          <div className="num-md text-info">{bankTransferCount}</div>
          <div className="text-[10px] text-ink-500">Auto-pays from checking</div>
        </Cell>
        <Cell className="cell-flex cell-pad-sm" style={{ gridColumn: '3/5' }}>
          <Tag>Add Expense</Tag>
          <button className="btn-primary mt-2" onClick={add}>+ Add new expense</button>
        </Cell>
      </div>
      <Cell>
        <Tag>Fixed Expenses — {items.length}</Tag>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
          {items.map(e => {
            const accent = CAT_COLOR[e.category as ExpenseCategory] ?? '#71717a';
            return (
              <div key={e.id} className="bg-paper-100 border border-paper-300 rounded-cell p-3 relative" style={{borderLeft: `3px solid ${accent}`}}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <input className="bg-transparent border-0 focus:outline-none text-[13px] font-semibold text-ink-900 w-full" value={e.name} onChange={ev => update(e.id, 'name', ev.target.value)} />
                    <div className="text-[9px] uppercase tracking-wider mt-0.5 font-bold" style={{color: accent}}>{e.category}</div>
                  </div>
                  <CurrencyInput value={e.amount} onChange={v => update(e.id, 'amount', v)} className="w-24" />
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                  <select className="bg-paper-200 border border-paper-400 rounded px-1.5 py-1 text-[10px]" value={e.category} onChange={ev => update(e.id, 'category', ev.target.value)}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select className="bg-paper-200 border border-paper-400 rounded px-1.5 py-1 text-[10px]" value={e.cadence} onChange={ev => update(e.id, 'cadence', ev.target.value)}>
                    {CADENCES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select className="bg-paper-200 border border-paper-400 rounded px-1.5 py-1 text-[10px]" value={e.paymentMethod} onChange={ev => update(e.id, 'paymentMethod', ev.target.value)}>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="flex items-center justify-between mt-2 text-[10px]">
                  <label className="text-ink-500 flex items-center gap-1.5">
                    <input type="checkbox" checked={e.isActive} onChange={ev => update(e.id, 'isActive', ev.target.checked)} />
                    Active
                  </label>
                  <button className="text-danger/80 hover:text-danger" onClick={() => remove(e.id)}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      </Cell>
    </>
  );
}

function TiersTab() {
  const items = useLiveQuery(() => db.tiers.orderBy('priority').toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const { showToast } = useAppUI();
  if (!items || !accounts) return null;

  const update = async (id: number, field: string, value: any) => { await db.tiers.update(id, { [field]: value }); scheduleAutoSave(500); };
  const add = async () => {
    const maxPriority = items?.reduce((m, t) => Math.max(m, t.priority), -1) ?? -1;
    await db.tiers.add({ priority: maxPriority + 1, name: 'New tier', cap: 1000, capType: 'fixed', targetAccount: accounts?.[0]?.name ?? '', resetCadence: 'none', isActive: true } as any);
    scheduleAutoSave(500);
  };
  const remove = async (id: number) => { if (!confirm('Delete this tier?')) return; await db.tiers.delete(id); scheduleAutoSave(500); showToast('Deleted', 'success'); };

  return (
    <Cell>
      <div className="flex items-center justify-between mb-2">
        <Tag>Allocation Waterfall — Suggestion only</Tag>
        <button className="btn-ghost" onClick={add}>+ Add tier</button>
      </div>
      <div className="text-[10px] text-ink-500 mb-3">Lower priority fills first. Editing tiers never moves money — they only power the "Suggested" hint on Payday.</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {items.map(t => (
          <div key={t.id} className="bg-paper-100 border border-paper-300 rounded-cell p-3">
            <div className="flex items-start gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-accent text-ink-900 grid place-items-center font-black text-[13px] shrink-0">{t.priority}</div>
              <div className="flex-1 min-w-0">
                <input className="bg-transparent border-0 focus:outline-none text-[13px] font-semibold text-ink-900 w-full" value={t.name} onChange={e => update(t.id, 'name', e.target.value)} />
                <div className="text-[10px] text-ink-500">→ {t.targetAccount}</div>
              </div>
              <CurrencyInput value={t.cap} onChange={v => update(t.id, 'cap', v)} className="w-24" />
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-[10px]">
              <select className="bg-paper-200 border border-paper-400 rounded px-1.5 py-1 text-[10px]" value={t.capType} onChange={e => update(t.id, 'capType', e.target.value)}>
                {CAP_TYPES.map(c => <option key={c} value={c}>cap: {c}</option>)}
              </select>
              <select className="bg-paper-200 border border-paper-400 rounded px-1.5 py-1 text-[10px]" value={t.resetCadence} onChange={e => update(t.id, 'resetCadence', e.target.value)}>
                {RESET_CADENCES.map(r => <option key={r} value={r}>reset: {r}</option>)}
              </select>
              <select className="bg-paper-200 border border-paper-400 rounded px-1.5 py-1 text-[10px]" value={t.targetAccount} onChange={e => update(t.id, 'targetAccount', e.target.value)}>
                {accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3 mt-2 text-[10px]">
              <label className="text-ink-500 flex items-center gap-1">Pri
                <input type="number" className="w-12 bg-paper-200 border border-paper-400 rounded px-1.5 py-0.5 tabular text-[10px]" value={t.priority} onChange={e => update(t.id, 'priority', parseInt(e.target.value) || 0)} />
              </label>
              <label className="text-ink-500 flex items-center gap-1.5">
                <input type="checkbox" checked={t.isActive} onChange={e => update(t.id, 'isActive', e.target.checked)} />
                Active
              </label>
              <button className="text-danger/80 hover:text-danger ml-auto" onClick={() => remove(t.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </Cell>
  );
}
