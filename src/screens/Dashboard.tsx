import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { db } from '../db';
import { Cell, Tag, Money, Bar, Spark } from '../components/UI';
import { netWorth, totalLiquid, totalInvested, totalOther, totalDebt, monthlyExpenseTotal, savingsRateYTD, ccRunway, ytdSavings } from '../core/calc';
import { allocate } from '../core/allocator';
import { fmt, fmtDate, convertCadence } from '../core/dates';

export default function Dashboard() {
  const accounts = useLiveQuery(() => db.accounts.toArray(), []);
  const liabilities = useLiveQuery(() => db.liabilities.toArray(), []);
  const incomeSources = useLiveQuery(() => db.incomeSources.toArray(), []);
  const expenses = useLiveQuery(() => db.fixedExpenses.toArray(), []);
  const tiers = useLiveQuery(() => db.tiers.toArray(), []);
  const history = useLiveQuery(() => db.paycheckEvents.toArray(), []);
  const snapshots = useLiveQuery(() => db.netWorthSnapshots.orderBy('date').toArray(), []);
  const settings = useLiveQuery(() => db.settings.get(1), []);

  if (!accounts || !liabilities || !incomeSources || !expenses || !tiers || !history || !snapshots || !settings) {
    return <div className="text-ink-200 p-8">Loading…</div>;
  }

  const liquid = totalLiquid(accounts);
  const invested = totalInvested(accounts);
  const other = totalOther(accounts);
  const debt = totalDebt(liabilities);
  const nw = netWorth(accounts, liabilities);

  const primaryIncome = incomeSources.find(i => i.sourceType === 'paycheck' && i.isActive);
  const primaryChecking = accounts.find(a => a.type === 'checking');
  const cc = liabilities.find(l => l.isActive && l.type === 'credit_card');

  const nextPlan = primaryIncome ? allocate({
    netPay: primaryIncome.amount, payCadence: primaryIncome.cadence,
    accounts, liabilities, tiers, fixedExpenses: expenses,
    paycheckHistory: history, settings,
  }) : null;

  const runway = (cc && primaryIncome && primaryChecking) ? ccRunway(
    cc.balance, cc.dueDate, primaryChecking.balance,
    primaryIncome.amount, primaryIncome.cadence,
    expenses.filter(e => e.isActive && e.paymentMethod === 'Bank Transfer')
      .reduce((s, e) => s + convertCadence(e.amount, e.cadence, primaryIncome.cadence), 0),
  ) : null;

  const savingsRate = savingsRateYTD(history, accounts);
  const ytdSaved = ytdSavings(history, accounts);
  const monthlyExp = monthlyExpenseTotal(expenses);
  const activeTiers = [...tiers].filter(t => t.isActive).sort((a, b) => a.priority - b.priority);
  const sparkData = snapshots.length > 1 ? snapshots.map(s => s.netWorth) : [nw, nw];
  const chartData = snapshots.map(s => ({ date: s.date.slice(5, 10), net: s.netWorth }));

  return (
    <>
      <div className="screen-header">
        <h1 className="screen-title">Dashboard</h1>
        <div className="screen-meta">As of {fmtDate(new Date())}</div>
      </div>

      {/* Top bento — 4 cols × 2 rows */}
      <div className="bento bento-4 mb-2" style={{ gridTemplateRows: '1fr 1fr' }}>
        {/* Net Worth — 2×2 hero */}
        <Cell
          className="cell-flex"
          style={{ gridColumn: '1/3', gridRow: '1/3', position: 'relative' }}
          helpTitle="Net Worth"
          help={<>
            <p>Sum of <strong>every account balance</strong> minus the sum of <strong>active liability balances</strong>.</p>
            <p>"On track" turns on when your savings rate YTD meets the target you set in Settings → App Preferences. The little spark line is your net worth trend across recent net-worth snapshots (one per applied paycheck).</p>
          </>}
        >
          <div style={{ position:'absolute', right:-24, top:-24, width:160, height:160, borderRadius:'50%', background:'rgba(74,222,128,0.06)', pointerEvents:'none' }} />
          <div>
            <Tag>Net Worth</Tag>
            <div className={`num-hero mt-2 ${nw >= 0 ? 'text-ink-50' : 'text-danger'}`}><Money amount={nw} showCents={false} /></div>
            <div className="text-[11px] text-ink-200 mt-2">All accounts − active debt</div>
          </div>
          <div className="flex justify-between items-end">
            <div>
              <div className={`text-[11px] font-semibold ${savingsRate >= settings.targetSavingsRate ? 'text-accent' : 'text-warn'}`}>
                {savingsRate >= settings.targetSavingsRate ? '↑ On track' : '· Below target'}
              </div>
              <div className="text-[10px] text-ink-200">Savings rate {(savingsRate * 100).toFixed(1)}% YTD</div>
            </div>
            <Spark data={sparkData} color="#4ade80" width={100} height={36} />
          </div>
        </Cell>

        <Cell
          className="cell-flex"
          helpTitle="Liquid"
          help={<p>Sum of every account typed <strong>checking</strong>, <strong>HYSA</strong>, or <strong>cash</strong>. Money you can spend without penalties or selling investments.</p>}
        >
          <Tag>Liquid</Tag>
          <div className="num-lg text-ink-50"><Money amount={liquid} showCents={false} /></div>
          <div className="text-[10px] text-ink-200">Checking + HYSA + cash</div>
        </Cell>

        <Cell
          className="cell-flex"
          helpTitle="Invested"
          help={<p>Sum of accounts typed <strong>roth_ira</strong> and <strong>brokerage</strong>. Doesn't include HYSA (counted as Liquid) or accounts typed "other" (those show in their own card if you have any).</p>}
        >
          <Tag>Invested</Tag>
          <div className="num-lg text-ink-50"><Money amount={invested} showCents={false} /></div>
          <div className="text-[10px] text-ink-200">Roth + brokerage</div>
        </Cell>

        {/* Savings rate — GREEN accent */}
        <Cell
          variant="green"
          className="cell-flex"
          helpTitle="Savings Rate YTD"
          help={<>
            <p>Of every dollar of paycheck applied this year, how many went somewhere other than your checking account?</p>
            <p>Formula: (sum of paycheck allocations to non-checking accounts and liability paydowns this year) ÷ (sum of net pay applied this year). Liability paydowns count as savings — they raise net worth identically to a deposit.</p>
            <p>Target is set in Settings → App Preferences.</p>
          </>}
        >
          <Tag onGreen>Savings Rate YTD</Tag>
          <div className="num-xl text-black">{(savingsRate * 100).toFixed(1)}%</div>
          <div className="text-[10px]" style={{color:'rgba(0,0,0,0.5)'}}>
            Target {(settings.targetSavingsRate * 100).toFixed(0)}% · <Money amount={ytdSaved} showCents={false} /> saved
          </div>
        </Cell>

        <Cell
          variant={debt > 0 ? 'warn' : 'default'}
          className="cell-flex"
          helpTitle="Debt"
          help={<p>Sum of every <strong>active</strong> liability's balance. Inactive liabilities (e.g. paid-off student loans you toggled off) don't count. To pay one down: log a paycheck and add an amount in the Liability Paydown row.</p>}
        >
          <Tag>Debt</Tag>
          <div className={`num-lg ${debt > 0 ? 'text-warn' : 'text-ink-50'}`}><Money amount={debt} showCents={false} /></div>
          <div className="text-[10px] text-ink-200">{liabilities.filter(l => l.isActive).length} active liabilit{liabilities.filter(l => l.isActive).length === 1 ? 'y' : 'ies'}</div>
        </Cell>
      </div>

      {/* CC Runway — only when CC has balance */}
      {cc && runway && cc.balance > 0 && (
        <Cell
          variant={runway.onTrack ? 'default' : 'warn'}
          className="mb-2"
          helpTitle="Credit Card Runway"
          help={<>
            <p>Forecast: between today and the CC's due date, will your projected checking balance cover the statement?</p>
            <p>Math: current checking + (paychecks remaining before due) × (net pay − bank-transfer reserve). If that projection is less than the CC balance, this card flips to "Short by $X" and the cell turns warn-orange.</p>
            <p>Edit the due date on the Accounts screen.</p>
          </>}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <Tag>Credit Card Runway</Tag>
              <div className="text-[13px] text-ink-50 font-semibold mt-1">{cc.name}</div>
              <div className="text-[11px] text-ink-200">Due in {runway.daysUntilDue} days · {fmtDate(cc.dueDate!)}</div>
            </div>
            <div className="text-right">
              <div className="num-md text-warn"><Money amount={cc.balance} /></div>
              <div className={`text-[11px] font-semibold mt-0.5 ${runway.onTrack ? 'text-accent' : 'text-danger'}`}>
                {runway.onTrack ? '✓ On track' : `Short by ${fmt(runway.shortfall)}`}
              </div>
            </div>
          </div>
        </Cell>
      )}

      {/* Tiers + secondary stats */}
      <div className="bento bento-4 mb-2">
        <Cell
          className="cell-flex"
          style={{ gridColumn: '1/4' }}
          helpTitle="Allocation Tiers"
          help={<>
            <p>Tiers are an <strong>optional waterfall suggestion</strong> for how each paycheck should flow into your accounts. They do <strong>not</strong> auto-apply — you always pick the split manually on Payday. The "Use suggested" button there pre-fills these numbers.</p>
            <p>Each bar shows current balance vs the tier's cap (e.g., $7k Roth annual). The +$X next number is what tier 0 → priority order would suggest sending here from your next paycheck.</p>
            <p>Configure tiers in Manage → Tiers.</p>
          </>}
        >
          <div className="flex items-center justify-between mb-2">
            <Tag>Allocation Tiers — Suggested pacing</Tag>
            <Link to="/payday" className="btn-primary">Log a paycheck →</Link>
          </div>
          <div className="flex gap-3 mt-2">
            {activeTiers.map(tier => {
              const plan = nextPlan?.tiers.find(p => p.tierId === tier.id);
              const progress = plan?.currentProgress ?? 0;
              const cap = plan?.cap ?? tier.cap;
              const isUnlimited = tier.capType === 'unlimited';
              return (
                <div key={tier.id} className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-5 h-5 rounded-md bg-ink-700 text-ink-50 grid place-items-center text-[10px] font-bold shrink-0">{tier.priority}</div>
                      <span className="text-[11px] font-semibold text-ink-50 truncate">{tier.name}</span>
                    </div>
                    <span className="text-[10px] text-ink-200 tabular shrink-0">
                      {isUnlimited ? '∞' : `${cap > 0 ? Math.round((progress / cap) * 100) : 0}%`}
                    </span>
                  </div>
                  {!isUnlimited && <Bar value={progress} max={cap} height={4} />}
                  {plan && plan.thisAllocation > 0 && (
                    <div className="text-[9px] text-accent mt-1">+<Money amount={plan.thisAllocation} showCents={false} /> next</div>
                  )}
                </div>
              );
            })}
          </div>
        </Cell>

        <Cell
          className="cell-flex cell-pad-sm"
          helpTitle="Monthly Out"
          help={<p>Total of every <strong>active</strong> fixed expense, normalized to a monthly amount (a $300/biweekly bill becomes ~$650/mo). Includes all payment methods — Bank Transfer, Credit Card, etc. Edit in Manage → Expenses.</p>}
        >
          <Tag>Monthly Out</Tag>
          <div className="num-md text-ink-50"><Money amount={monthlyExp} showCents={false} /></div>
          <Link to="/payday" className="btn-primary text-center justify-center mt-1">Log paycheck ↑</Link>
        </Cell>
      </div>

      {/* Chart row */}
      {chartData.length > 1 && (
        <Cell
          className="flex-1"
          style={{ minHeight: 200 }}
          helpTitle="Net Worth Over Time"
          help={<p>One data point per applied paycheck — every time you click "Apply paycheck", a snapshot of net worth is stored. The chart starts when you have at least 2 snapshots. For multi-line breakdowns (liquid, debt, credit cards), see the Trends page.</p>}
        >
          <Tag>Net Worth Over Time</Tag>
          <div className="mt-2 h-[calc(100%-24px)]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="date" stroke="#71717a" fontSize={10} />
                <YAxis stroke="#71717a" fontSize={10} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: '#141414', border: '1px solid #262626', borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="net" stroke="#4ade80" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Cell>
      )}
    </>
  );
}
