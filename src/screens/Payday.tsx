import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { allocate } from '../core/allocator';
import { bankExpensesPerPeriod } from '../core/calc';
import { fmtDate } from '../core/dates';
import { Cell, Tag, Money, CurrencyInput } from '../components/UI';
import { useAppUI } from '../store/useAppStore';
import { scheduleAutoSave } from '../sync/driveSync';
import type { PaycheckEvent, Cadence, Allocation } from '../types';

export default function Payday() {
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const liabilities = useLiveQuery(() => db.liabilities.toArray(), []);
  const incomeSources = useLiveQuery(() => db.incomeSources.toArray(), []);
  const expenses = useLiveQuery(() => db.fixedExpenses.toArray(), []);
  const tiers = useLiveQuery(() => db.tiers.toArray(), []);
  const history = useLiveQuery(() => db.paycheckEvents.toArray(), []);
  const settings = useLiveQuery(() => db.settings.get(1), []);

  const [sourceId, setSourceId] = useState<number | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState<string>('');
  const [splits, setSplits] = useState<Record<number, number>>({});
  const [liabilitySplits, setLiabilitySplits] = useState<Record<number, number>>({});
  const [expandedHistory, setExpandedHistory] = useState<Set<number>>(new Set());
  const { showToast } = useAppUI();

  const activeSources = (incomeSources ?? []).filter(s => s.isActive);
  const selectedSource = activeSources.find(s => s.id === sourceId) ?? activeSources.find(s => s.sourceType === 'paycheck') ?? activeSources[0];
  const effectiveAmount = amount > 0 ? amount : selectedSource?.amount ?? 0;
  const effectiveCadence: Cadence = selectedSource?.cadence ?? 'biweekly';

  const openedAccounts = (accounts ?? []).filter(a => a.openedYet).slice().sort((a, b) => {
    const ao = a.sortOrder ?? 1e9, bo = b.sortOrder ?? 1e9;
    if (ao !== bo) return ao - bo;
    return a.id - b.id;
  });
  const primaryChecking = (accounts ?? []).find(a => a.type === 'checking');
  const checkingReserve = bankExpensesPerPeriod(expenses ?? [], effectiveCadence);

  const suggested = useMemo(() => {
    if (!accounts || !liabilities || !tiers || !expenses || !history || !settings) return new Map<string, number>();
    const plan = allocate({
      netPay: effectiveAmount, payCadence: effectiveCadence,
      accounts, liabilities, tiers, fixedExpenses: expenses,
      paycheckHistory: history, settings, now: new Date(date),
    });
    const m = new Map<string, number>();
    for (const t of plan.tiers) m.set(t.targetAccount, (m.get(t.targetAccount) ?? 0) + t.thisAllocation);
    const checking = accounts.find(a => a.type === 'checking');
    if (checking) m.set(checking.name, (m.get(checking.name) ?? 0) + plan.bankExpensesPaid);
    return m;
  }, [accounts, liabilities, tiers, expenses, history, settings, effectiveAmount, effectiveCadence, date]);

  useEffect(() => {
    if (!primaryChecking) return;
    setSplits(prev => ({ ...prev, [primaryChecking.id]: Math.round(checkingReserve * 100) / 100 }));
  }, [primaryChecking?.id, checkingReserve]);

  if (!accounts || !liabilities || !incomeSources || !expenses || !tiers || !history || !settings) {
    return <div className="text-ink-500 p-8">Loading…</div>;
  }

  const accountAllocated = Object.values(splits).reduce((s, v) => s + (v || 0), 0);
  const liabilityAllocated = Object.values(liabilitySplits).reduce((s, v) => s + (v || 0), 0);
  const allocated = accountAllocated + liabilityAllocated;
  const remaining = effectiveAmount - allocated;
  const activeLiabilities = liabilities?.filter(l => l.isActive && l.balance > 0.005) ?? [];
  const canApply = !!selectedSource && effectiveAmount > 0 && Math.abs(remaining) < 0.01;

  const warnings: string[] = [];
  if (remaining < -0.005) warnings.push(`Over-allocated by ${fmtMoney(Math.abs(remaining))}. Reduce one of the rows below before applying.`);
  if (remaining > 0.005) warnings.push(`${fmtMoney(remaining)} left to allocate. Assign every dollar before applying.`);
  if (primaryChecking && (splits[primaryChecking.id] ?? 0) < checkingReserve - 0.005) {
    warnings.push(`Checking is below the bank-transfer reserve (${fmtMoney(checkingReserve)} needed). Auto-pays may bounce.`);
  }
  for (const l of activeLiabilities) {
    const pay = liabilitySplits[l.id] ?? 0;
    if (pay > l.balance + 0.005) warnings.push(`Paydown for "${l.name}" (${fmtMoney(pay)}) exceeds the current balance (${fmtMoney(l.balance)}).`);
  }
  const cc = liabilities.find(l => l.isActive && l.type === 'credit_card' && l.dueDate);
  if (cc && primaryChecking) {
    const daysOut = Math.ceil((new Date(cc.dueDate!).getTime() - new Date(date).getTime()) / 86400000);
    const projectedChecking = primaryChecking.balance + (splits[primaryChecking.id] ?? 0) - checkingReserve;
    if (daysOut >= 0 && daysOut <= 14 && projectedChecking < cc.balance) {
      warnings.push(`CC "${cc.name}" due in ${daysOut} days (${fmtMoney(cc.balance)}). Projected checking: ${fmtMoney(projectedChecking)}.`);
    }
  }

  const setSplit = (id: number, v: number) => setSplits(p => ({ ...p, [id]: v }));
  const setLiabilitySplit = (id: number, v: number) => setLiabilitySplits(p => ({ ...p, [id]: v }));
  const useSuggested = (name: string, id: number) => setSplit(id, Math.round((suggested.get(name) ?? 0) * 100) / 100);
  const applySuggestedToAll = () => {
    const next: Record<number, number> = {};
    for (const a of openedAccounts) next[a.id] = Math.round((suggested.get(a.name) ?? 0) * 100) / 100;
    setSplits(next);
  };
  const clearAll = () => {
    const next: Record<number, number> = {};
    if (primaryChecking) next[primaryChecking.id] = Math.round(checkingReserve * 100) / 100;
    setSplits(next);
    setLiabilitySplits({});
  };

  async function applyPaycheck() {
    if (!selectedSource) { showToast('No active income source to apply.', 'error'); return; }
    if (effectiveAmount <= 0) { showToast('Amount must be greater than zero.', 'error'); return; }
    if (Math.abs(remaining) >= 0.01) {
      showToast(remaining > 0 ? `Allocate the remaining ${fmtMoney(remaining)} first.` : `Over-allocated by ${fmtMoney(Math.abs(remaining))}.`, 'error');
      return;
    }

    const accountAllocs: Allocation[] = Object.entries(splits)
      .map(([id, amt]) => ({ id: Number(id), amt: amt || 0 }))
      .filter(x => x.amt > 0)
      .map(x => { const a = accounts!.find(acc => acc.id === x.id)!; return { targetAccount: a.name, amount: x.amt }; });
    const liabilityAllocs: Allocation[] = Object.entries(liabilitySplits)
      .map(([id, amt]) => ({ id: Number(id), amt: amt || 0 }))
      .filter(x => x.amt > 0)
      .map(x => { const l = liabilities!.find(lia => lia.id === x.id)!; return { targetLiability: l.name, liabilityId: l.id, amount: x.amt }; });
    const allocations: Allocation[] = [...accountAllocs, ...liabilityAllocs];

    const event: Omit<PaycheckEvent, 'id'> = {
      date, source: selectedSource.name, netAmount: effectiveAmount,
      allocations, bankExpensesPaid: checkingReserve, notes,
    };

    try {
      await db.transaction('rw', [db.accounts, db.liabilities, db.paycheckEvents, db.netWorthSnapshots], async () => {
        for (const a of accounts!) {
          const delta = splits[a.id] ?? 0;
          if (delta === 0 && a.id !== primaryChecking?.id) continue;
          const isChecking = a.id === primaryChecking?.id;
          await db.accounts.update(a.id, { balance: a.balance + delta - (isChecking ? checkingReserve : 0), lastUpdated: date });
        }
        for (const l of liabilities!) {
          const pay = liabilitySplits[l.id] ?? 0;
          if (pay <= 0) continue;
          await db.liabilities.update(l.id, { balance: Math.max(0, l.balance - pay) });
        }
        await db.paycheckEvents.add(event as PaycheckEvent);

        const freshAccounts = await db.accounts.toArray();
        const freshLiabs = await db.liabilities.toArray();
        const liquid = freshAccounts.filter(a => ['checking', 'hysa', 'cash'].includes(a.type)).reduce((s, a) => s + a.balance, 0);
        const invested = freshAccounts.filter(a => ['roth_ira', 'brokerage'].includes(a.type)).reduce((s, a) => s + a.balance, 0);
        const totalAssetsSum = freshAccounts.reduce((s, a) => s + a.balance, 0);
        const debtSum = freshLiabs.filter(l => l.isActive).reduce((s, l) => s + l.balance, 0);
        const ccTotal = freshLiabs.filter(l => l.type === 'credit_card' && l.isActive).reduce((s, l) => s + l.balance, 0);
        await db.netWorthSnapshots.add({
          date, totalLiquid: liquid, totalInvested: invested, totalDebt: debtSum,
          totalCreditCard: ccTotal, netWorth: totalAssetsSum - debtSum,
          notes: `After paycheck: ${selectedSource.name}`,
        } as any);
      });
    } catch (err) {
      console.error('Apply paycheck failed:', err);
      showToast(`Apply failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
      return;
    }

    scheduleAutoSave(500);
    setAmount(0); setNotes(''); clearAll();
    showToast('Paycheck applied. Balances updated.', 'success');
  }

  const remainingTone = Math.abs(remaining) < 0.01 ? 'text-accent' : remaining < 0 ? 'text-danger' : 'text-warn';
  const remainingVariant = Math.abs(remaining) < 0.01 ? 'green' : 'default';

  return (
    <>
      <div className="screen-header">
        <h1 className="screen-title">Payday</h1>
        <div className="screen-meta">Log a paycheck — type how much goes where.</div>
      </div>

      {/* Header row: 4-up summary */}
      <div className="grid grid-cols-4 gap-2 mb-2">
        <Cell
          className="cell-pad-sm"
          helpTitle="Source"
          help={<p>Which income source this paycheck is coming from. The dropdown lists every <strong>active</strong> income from Manage → Income. The selected source's <em>cadence</em> (weekly / biweekly / monthly / etc.) drives how monthly fixed expenses get prorated into the per-paycheck checking reserve.</p>}
        >
          <Tag>Source</Tag>
          <select className="input mt-1" value={selectedSource?.id ?? ''} onChange={e => setSourceId(parseInt(e.target.value))}>
            {activeSources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input type="date" className="input mt-2" value={date} onChange={e => setDate(e.target.value)} />
        </Cell>
        <Cell
          className="cell-pad-sm"
          helpTitle="Net Pay"
          help={<>
            <p>The dollar amount you're allocating from this paycheck. Defaults to the source's stored amount; type a different number to override (clearing the field reverts to the default).</p>
            <p>This is what hits your bank account — net of taxes / 401k / etc. The app doesn't track gross or pre-tax contributions.</p>
          </>}
        >
          <Tag>Net Pay</Tag>
          <div className="num-sm text-ink-900 mt-1"><Money amount={effectiveAmount} showCents={false} /></div>
          <CurrencyInput value={amount} onChange={setAmount} className="mt-2" />
        </Cell>
        <Cell
          className="cell-pad-sm"
          helpTitle="Allocated"
          help={<>
            <p>Running sum of everything you've typed into the per-account split rows + the per-liability paydown rows below.</p>
            <p>The "Reserve" line is what will leave checking this period for Bank-Transfer fixed expenses (rent, car insurance, etc.) — it's pre-filled into your Chase Checking row so you can't accidentally underfund it.</p>
          </>}
        >
          <Tag>Allocated</Tag>
          <div className="num-sm text-accent-dim mt-1"><Money amount={allocated} showCents={false} /></div>
          <div className="text-[10px] text-ink-500 mt-1">Reserve: <Money amount={checkingReserve} showCents={false} /></div>
        </Cell>
        <Cell
          variant={remainingVariant}
          className="cell-pad-sm"
          helpTitle="Remaining"
          help={<>
            <p><strong>Net pay − Allocated.</strong> When this hits exactly $0, the Apply paycheck button unlocks (turns green).</p>
            <p>Quick way to zero it: click "+Fill" on any account or liability row to dump the leftover into that bucket.</p>
          </>}
        >
          <Tag onGreen={remainingVariant === 'green'}>Remaining</Tag>
          <div className={`num-sm mt-1 ${remainingVariant === 'green' ? 'text-black' : remainingTone}`}>
            <Money amount={remaining} showSign showCents={false} />
          </div>
          <div className={`text-[10px] mt-1 ${remainingVariant === 'green' ? '' : 'text-ink-500'}`} style={remainingVariant === 'green' ? {color:'rgba(0,0,0,0.5)'} : {}}>
            {Math.abs(remaining) < 0.01 ? 'Ready to apply' : 'Allocate every dollar'}
          </div>
        </Cell>
      </div>

      {warnings.length > 0 && (
        <Cell variant="warn" className="mb-2">
          <Tag>Warnings</Tag>
          <ul className="mt-1.5 space-y-1">
            {warnings.map((w, i) => <li key={i} className="text-[12px] text-warn">· {w}</li>)}
          </ul>
        </Cell>
      )}

      {/* Account allocation cells */}
      <Cell
        className="mb-2"
        helpTitle="Allocate to Accounts"
        help={<>
          <p>One row per <strong>opened</strong> account. Type how much of the paycheck lands in each. The Chase Checking row pre-fills with the bank-transfer reserve so it won't bounce; everything else starts at $0.</p>
          <p><strong>Sug $X</strong> = the tier waterfall's suggestion for that account. Click it to copy into the input.</p>
          <p><strong>+Fill</strong> = dump whatever Remaining is into that row (useful for the catch-all, often brokerage or checking).</p>
          <p><strong>Use suggested</strong> at the top fills every row with the tier suggestion at once.</p>
        </>}
      >
        <div className="flex items-center justify-between mb-3">
          <Tag>Allocate to Accounts</Tag>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={applySuggestedToAll}>Use suggested</button>
            <button className="btn-ghost" onClick={clearAll}>Reset</button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {openedAccounts.map(a => {
            const isChecking = a.id === primaryChecking?.id;
            const value = splits[a.id] ?? 0;
            const suggestedAmount = suggested.get(a.name) ?? 0;
            return (
              <div key={a.id} className="bg-paper-100 border border-paper-300 rounded-cell p-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-ink-900 truncate">{a.name}</span>
                    <span className="chip-muted">{a.type}</span>
                  </div>
                  <div className="text-[10px] text-ink-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>Bal <Money amount={a.balance} showCents={false} /></span>
                    {isChecking && <span className="text-warn">·  ≥ <Money amount={checkingReserve} /></span>}
                    {suggestedAmount > 0 && (
                      <button className="text-accent hover:underline" onClick={() => useSuggested(a.name, a.id)}>
                        Sug <Money amount={suggestedAmount} showCents={false} />
                      </button>
                    )}
                    {remaining > 0.005 && (
                      <button className="text-accent hover:underline" onClick={() => setSplit(a.id, Math.round((value + remaining) * 100) / 100)}>+Fill</button>
                    )}
                  </div>
                </div>
                <div className="w-32 shrink-0"><CurrencyInput value={value} onChange={v => setSplit(a.id, v)} /></div>
              </div>
            );
          })}
        </div>
      </Cell>

      {activeLiabilities.length > 0 && (
        <Cell
          className="mb-2"
          helpTitle="Liability Paydown"
          help={<>
            <p>Allocate part of this paycheck directly to a debt. The amount you type comes out of the paycheck pool and is subtracted from the liability balance — net worth goes up by exactly that amount (same effect as putting it in HYSA, just on the debt side).</p>
            <p>Money does <strong>not</strong> flow through your checking account on this path. If you also have a Bank-Transfer fixed expense pointing at this same liability, it's a separate flow (cash leaves checking but doesn't auto-reduce the debt). Pick one approach per loan.</p>
            <p>"+Fill" caps at the outstanding balance — you can't accidentally overpay.</p>
          </>}
        >
          <Tag>Liability Paydown</Tag>
          <div className="text-[10px] text-ink-500 mt-1 mb-3">Reduces the liability balance directly. Doesn't flow through checking.</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {activeLiabilities.map(l => {
              const value = liabilitySplits[l.id] ?? 0;
              const daysOut = l.dueDate ? Math.ceil((new Date(l.dueDate).getTime() - new Date(date).getTime()) / 86400000) : null;
              return (
                <div key={l.id} className="bg-paper-100 border border-paper-300 rounded-cell p-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-ink-900 truncate">{l.name}</span>
                      <span className="chip-muted">{l.type.replace('_', ' ')}</span>
                    </div>
                    <div className="text-[10px] text-ink-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>Bal <Money amount={l.balance} showCents={false} /></span>
                      {l.apr > 0 && <span>APR {(l.apr * 100).toFixed(2)}%</span>}
                      {daysOut !== null && daysOut >= 0 && daysOut <= 30 && <span className="text-warn">{daysOut}d</span>}
                      {value >= l.balance - 0.005 && value > 0 && <span className="text-accent">Pays off</span>}
                      {remaining > 0.005 && (
                        <button className="text-accent hover:underline" onClick={() => setLiabilitySplit(l.id, Math.round(Math.min(l.balance, value + remaining) * 100) / 100)}>+Fill</button>
                      )}
                    </div>
                  </div>
                  <div className="w-32 shrink-0"><CurrencyInput value={value} onChange={v => setLiabilitySplit(l.id, v)} /></div>
                </div>
              );
            })}
          </div>
        </Cell>
      )}

      {/* Confirm — green when ready */}
      <Cell
        variant={canApply ? 'green' : 'default'}
        className="mb-2"
        helpTitle="Confirm & Apply"
        help={<>
          <p>Clicking "Apply paycheck" runs everything in a single DB transaction:</p>
          <ul className="list-disc ml-4 space-y-1">
            <li>Each account's balance is increased by the amount you typed (or for checking: increased by your typed amount, then decreased by the bank-transfer reserve to model the auto-pays leaving).</li>
            <li>Each liability's balance is decreased by the paydown amount you typed.</li>
            <li>A PaycheckEvent record is logged with the breakdown for history.</li>
            <li>A net-worth snapshot is captured for the Trends chart.</li>
          </ul>
          <p>The button only unlocks when Remaining is exactly $0.</p>
        </>}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <Tag onGreen={canApply}>Confirm & Apply</Tag>
            <input
              className={`mt-2 w-full bg-transparent border-b ${canApply ? 'border-black/20 text-black placeholder-black/40' : 'border-paper-400 text-ink-900 placeholder-ink-300'} px-1 py-1 text-[12px] focus:outline-none`}
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Notes (optional)…"
            />
          </div>
          <button
            className={canApply ? 'bg-black text-accent font-bold rounded-lg px-4 py-2 text-[13px] hover:bg-black/80' : 'btn-ghost opacity-50 cursor-not-allowed'}
            onClick={applyPaycheck} disabled={!canApply}
          >
            Apply paycheck ({fmtDate(date)}) →
          </button>
        </div>
      </Cell>

      {history.length > 0 && (
        <Cell>
          <Tag>Recent Paychecks ({history.length})</Tag>
          <div className="mt-2 divide-y divide-ink-600">
            {history.slice().reverse().slice(0, 5).map(p => {
              const acctCount = p.allocations.filter(a => a.targetAccount).length;
              const liabCount = p.allocations.filter(a => a.targetLiability).length;
              const parts = [
                acctCount > 0 ? `${acctCount} acct${acctCount === 1 ? '' : 's'}` : null,
                liabCount > 0 ? `${liabCount} liab${liabCount === 1 ? '' : 's'}` : null,
              ].filter(Boolean);
              const isOpen = expandedHistory.has(p.id);
              return (
                <div key={p.id}>
                  <button className="w-full py-2 flex items-center justify-between hover:bg-paper-100/30 transition-colors text-left rounded px-2"
                    onClick={() => setExpandedHistory(prev => { const next = new Set(prev); if (next.has(p.id)) next.delete(p.id); else next.add(p.id); return next; })}>
                    <div className="flex items-center gap-2">
                      <span className={`text-ink-500 text-[10px] transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                      <div>
                        <div className="text-[12px] font-semibold text-ink-900">{p.source}</div>
                        <div className="text-[10px] text-ink-500">{fmtDate(p.date)} · {parts.join(' · ') || 'no allocations'}</div>
                      </div>
                    </div>
                    <div className="text-right tabular text-[12px] text-ink-900"><Money amount={p.netAmount} showCents={false} /></div>
                  </button>
                  {isOpen && (
                    <div className="px-2 pb-2 pl-7 text-[11px] divide-y divide-ink-600 bg-paper-50/40 rounded mb-1.5">
                      {p.allocations.map((a, idx) => (
                        <div key={idx} className="py-1.5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {a.targetAccount
                              ? <span className="chip-green">to acct</span>
                              : <span className="chip-warn">paydown</span>}
                            <span className="text-ink-900">{a.targetAccount || a.targetLiability}</span>
                          </div>
                          <span className="tabular text-ink-900"><Money amount={a.amount} showCents={false} /></span>
                        </div>
                      ))}
                      <div className="py-1.5 flex items-center justify-between text-ink-500">
                        <span>Bank-transfer reserve</span>
                        <span className="tabular">-<Money amount={p.bankExpensesPaid} showCents={false} /></span>
                      </div>
                      {p.notes && <div className="py-1.5 text-ink-500 italic">"{p.notes}"</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Cell>
      )}
    </>
  );
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
