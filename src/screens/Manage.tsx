import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Money, Section, CurrencyInput } from '../components/UI';
import { scheduleAutoSave } from '../sync/fileSync';
import { useAppUI } from '../store/useAppStore';
import type { Cadence, ExpenseCategory, PaymentMethod, IncomeType, CapType, ResetCadence } from '../types';

type Tab = 'income' | 'expenses' | 'tiers';

const CADENCES: Cadence[] = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'annual', 'irregular'];
const CATEGORIES: ExpenseCategory[] = ['housing', 'food', 'transportation', 'insurance', 'debt', 'subscriptions', 'entertainment', 'health', 'misc'];
const PAYMENT_METHODS: PaymentMethod[] = ['Bank Transfer', 'Credit Card', 'Cash', 'Autopay', 'Other'];
const INCOME_TYPES: IncomeType[] = ['paycheck', 'bonus', 'gift', 'reimbursement', 'side_income', 'other'];
const CAP_TYPES: CapType[] = ['fixed', 'dynamic', 'unlimited'];
const RESET_CADENCES: ResetCadence[] = ['none', 'annual', 'monthly', 'per_statement'];

export default function Manage() {
  const [tab, setTab] = useState<Tab>('expenses');

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Manage</h1>
      <div className="text-sm text-ink-300 mb-6">Configure your income, expenses, and the allocation waterfall.</div>

      <div className="flex gap-2 mb-6 border-b border-ink-700">
        {(['income', 'expenses', 'tiers'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 ${
              tab === t ? 'border-accent text-ink-50' : 'border-transparent text-ink-300 hover:text-ink-50'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'income' && <IncomeTab />}
      {tab === 'expenses' && <ExpensesTab />}
      {tab === 'tiers' && <TiersTab />}
    </div>
  );
}

function IncomeTab() {
  const items = useLiveQuery(() => db.incomeSources.toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const { showToast } = useAppUI();

  if (!items || !accounts) return null;

  async function update(id: number, field: string, value: any) {
    await db.incomeSources.update(id, { [field]: value });
    scheduleAutoSave(500);
  }

  async function add() {
    await db.incomeSources.add({
      name: 'New income source',
      sourceType: 'other',
      amount: 0,
      cadence: 'monthly',
      depositAccount: accounts?.[0]?.name ?? '',
      isActive: true,
    } as any);
    scheduleAutoSave(500);
  }

  async function remove(id: number) {
    if (!confirm('Delete this income source?')) return;
    await db.incomeSources.delete(id);
    scheduleAutoSave(500);
    showToast('Deleted', 'success');
  }

  return (
    <Section title="Income Sources" action={<button className="btn-ghost" onClick={add}>+ Add</button>}>
      <div className="text-xs text-ink-300 mb-3">
        Income sources feed the Payday screen. <strong>Cadence</strong> is especially important — it controls how monthly fixed expenses get prorated into a "checking reserve" on each paycheck (e.g., a $400/mo student loan reserves ~$184 out of a biweekly paycheck).
      </div>
      <div className="card divide-y divide-ink-700">
        {items.map(i => (
          <div key={i.id} className="p-4">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <input className="bg-transparent border-0 focus:outline-none font-medium text-ink-50 w-full" value={i.name} onChange={e => update(i.id, 'name', e.target.value)} />
                <div className="flex flex-wrap gap-3 mt-2 text-xs text-ink-300">
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-ink-400">Type</span>
                    <select className="bg-ink-700 border border-ink-600 rounded px-2 py-1" value={i.sourceType} onChange={e => update(i.id, 'sourceType', e.target.value)}>
                      {INCOME_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-ink-400">Cadence · drives per-paycheck reserve</span>
                    <select className="bg-ink-700 border border-ink-600 rounded px-2 py-1" value={i.cadence} onChange={e => update(i.id, 'cadence', e.target.value)}>
                      {CADENCES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-ink-400">Deposit account · reference only</span>
                    <select className="bg-ink-700 border border-ink-600 rounded px-2 py-1" value={i.depositAccount} onChange={e => update(i.id, 'depositAccount', e.target.value)}>
                      {accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                    </select>
                  </label>
                </div>
              </div>
              <div className="w-36">
                <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-0.5">Net per period</div>
                <CurrencyInput value={i.amount} onChange={v => update(i.id, 'amount', v)} />
              </div>
            </div>
            <div className="flex items-center justify-between mt-2 text-xs">
              <label className="text-ink-300 flex items-center gap-2">
                <input type="checkbox" checked={i.isActive} onChange={e => update(i.id, 'isActive', e.target.checked)} />
                Active
              </label>
              <button className="text-danger/80 hover:text-danger" onClick={() => remove(i.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ExpensesTab() {
  const items = useLiveQuery(() => db.fixedExpenses.toArray(), []);
  const { showToast } = useAppUI();

  if (!items) return null;

  async function update(id: number, field: string, value: any) {
    await db.fixedExpenses.update(id, { [field]: value });
    scheduleAutoSave(500);
  }

  async function add() {
    await db.fixedExpenses.add({
      name: 'New expense',
      category: 'misc',
      amount: 0,
      cadence: 'monthly',
      paymentMethod: 'Credit Card',
      isActive: true,
    } as any);
    scheduleAutoSave(500);
  }

  async function remove(id: number) {
    if (!confirm('Delete this expense?')) return;
    await db.fixedExpenses.delete(id);
    scheduleAutoSave(500);
    showToast('Deleted', 'success');
  }

  const monthlyTotal = items.filter(e => e.isActive).reduce((s, e) => {
    const perYear = e.cadence === 'monthly' ? e.amount * 12 :
                    e.cadence === 'biweekly' ? e.amount * 26 :
                    e.cadence === 'weekly' ? e.amount * 52 :
                    e.cadence === 'annual' ? e.amount :
                    e.cadence === 'quarterly' ? e.amount * 4 :
                    e.cadence === 'semimonthly' ? e.amount * 24 : 0;
    return s + perYear / 12;
  }, 0);

  return (
    <Section title={`Fixed Expenses — ${Math.round(monthlyTotal).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} / mo`}
             action={<button className="btn-ghost" onClick={add}>+ Add</button>}>
      <div className="text-xs text-ink-300 mb-3 space-y-1">
        <div>Recurring outflows. The <strong>Payment method</strong> field drives how each expense shows up on Payday:</div>
        <ul className="list-disc ml-5 space-y-0.5 text-ink-400">
          <li><strong className="text-ink-200">Bank Transfer</strong> — auto-debited from checking. These are summed per paycheck cadence and become the <em>Checking reserve</em> on Payday.</li>
          <li><strong className="text-ink-200">Credit Card</strong> — spent on the card; increases CC balance, paid off separately. Does <em>not</em> reserve money in checking.</li>
          <li><strong className="text-ink-200">Autopay / Cash / Other</strong> — informational only (counts toward monthly total but doesn't reserve cash).</li>
        </ul>
      </div>
      <div className="card divide-y divide-ink-700">
        {items.map(e => (
          <div key={e.id} className="p-4">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <input className="bg-transparent border-0 focus:outline-none font-medium text-ink-50 w-full" value={e.name} onChange={ev => update(e.id, 'name', ev.target.value)} />
                <div className="flex flex-wrap gap-3 mt-2 text-xs text-ink-300">
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-ink-400">Category</span>
                    <select className="bg-ink-700 border border-ink-600 rounded px-2 py-1" value={e.category} onChange={ev => update(e.id, 'category', ev.target.value)}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-ink-400">Cadence · prorated to paycheck</span>
                    <select className="bg-ink-700 border border-ink-600 rounded px-2 py-1" value={e.cadence} onChange={ev => update(e.id, 'cadence', ev.target.value)}>
                      {CADENCES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-ink-400">Payment method · see legend above</span>
                    <select className="bg-ink-700 border border-ink-600 rounded px-2 py-1" value={e.paymentMethod} onChange={ev => update(e.id, 'paymentMethod', ev.target.value)}>
                      {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </label>
                </div>
                {e.notes && <div className="text-xs text-ink-400 mt-1">{e.notes}</div>}
              </div>
              <div className="w-36">
                <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-0.5">Amount per period</div>
                <CurrencyInput value={e.amount} onChange={v => update(e.id, 'amount', v)} />
              </div>
            </div>
            <div className="flex items-center justify-between mt-2 text-xs">
              <label className="text-ink-300 flex items-center gap-2">
                <input type="checkbox" checked={e.isActive} onChange={ev => update(e.id, 'isActive', ev.target.checked)} />
                Active
              </label>
              <button className="text-danger/80 hover:text-danger" onClick={() => remove(e.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function TiersTab() {
  const items = useLiveQuery(() => db.tiers.orderBy('priority').toArray(), []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const { showToast } = useAppUI();

  if (!items || !accounts) return null;

  async function update(id: number, field: string, value: any) {
    await db.tiers.update(id, { [field]: value });
    scheduleAutoSave(500);
  }

  async function add() {
    const maxPriority = items?.reduce((m, t) => Math.max(m, t.priority), -1) ?? -1;
    await db.tiers.add({
      priority: maxPriority + 1,
      name: 'New tier',
      cap: 1000,
      capType: 'fixed',
      targetAccount: accounts?.[0]?.name ?? '',
      resetCadence: 'none',
      isActive: true,
    } as any);
    scheduleAutoSave(500);
  }

  async function remove(id: number) {
    if (!confirm('Delete this tier?')) return;
    await db.tiers.delete(id);
    scheduleAutoSave(500);
    showToast('Deleted', 'success');
  }

  return (
    <Section title="Allocation Waterfall" action={<button className="btn-ghost" onClick={add}>+ Add tier</button>}>
      <div className="text-xs text-ink-300 mb-3 space-y-1">
        <div><strong className="text-ink-200">Tiers are suggestion-only.</strong> Payday asks you to type each account split manually; these tiers power the "Suggested" hint next to each row and the Dashboard pacing widget. Editing a tier never moves money on its own.</div>
        <div className="text-ink-400">
          <strong>Priority</strong> is the waterfall order (0 fills first, then 1, etc.).
          <strong className="ml-2">Cap type</strong>: <em>fixed</em> = stop at Cap; <em>dynamic</em> = cap is computed from live data (priority 0 = CC balance + buffer); <em>unlimited</em> = overflow catch-all.
          <strong className="ml-2">Reset</strong>: <em>annual</em> zeroes the progress every Jan 1 (use for Roth IRA); <em>monthly</em> every 1st; <em>per_statement</em> resets after CC due date; <em>none</em> never resets.
        </div>
      </div>
      <div className="card divide-y divide-ink-700">
        {items.map(t => (
          <div key={t.id} className="p-4">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="w-16">
                <label className="text-xs text-ink-300">Priority</label>
                <input type="number" className="input tabular" value={t.priority} onChange={e => update(t.id, 'priority', parseInt(e.target.value) || 0)} />
              </div>
              <div className="flex-1 min-w-0">
                <input className="bg-transparent border-0 focus:outline-none font-medium text-ink-50 w-full" value={t.name} onChange={e => update(t.id, 'name', e.target.value)} />
                <div className="flex flex-wrap gap-3 mt-2 text-xs text-ink-300">
                  <label className="flex items-center gap-1">
                    Cap type:
                    <select className="bg-ink-700 border border-ink-600 rounded px-2 py-1" value={t.capType} onChange={e => update(t.id, 'capType', e.target.value)}>
                      {CAP_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-1">
                    Reset:
                    <select className="bg-ink-700 border border-ink-600 rounded px-2 py-1" value={t.resetCadence} onChange={e => update(t.id, 'resetCadence', e.target.value)}>
                      {RESET_CADENCES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-1">
                    Target:
                    <select className="bg-ink-700 border border-ink-600 rounded px-2 py-1" value={t.targetAccount} onChange={e => update(t.id, 'targetAccount', e.target.value)}>
                      {accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                    </select>
                  </label>
                </div>
                {t.notes && <div className="text-xs text-ink-400 mt-1">{t.notes}</div>}
              </div>
              <div className="w-36">
                <label className="text-xs text-ink-300">Cap</label>
                <CurrencyInput value={t.cap} onChange={v => update(t.id, 'cap', v)} />
                {t.capType === 'dynamic' && <div className="text-xs text-ink-400 mt-1">(computed at runtime)</div>}
                {t.capType === 'unlimited' && <div className="text-xs text-ink-400 mt-1">(no limit)</div>}
              </div>
            </div>
            <div className="flex items-center justify-between mt-2 text-xs">
              <label className="text-ink-300 flex items-center gap-2">
                <input type="checkbox" checked={t.isActive} onChange={e => update(t.id, 'isActive', e.target.checked)} />
                Active
              </label>
              <button className="text-danger/80 hover:text-danger" onClick={() => remove(t.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
