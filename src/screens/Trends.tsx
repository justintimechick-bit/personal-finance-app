import { useLiveQuery } from 'dexie-react-hooks';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { db } from '../db';
import { Cell, Tag, Money, Spark } from '../components/UI';

export default function Trends() {
  const snapshots = useLiveQuery(() => db.netWorthSnapshots.orderBy('date').toArray(), []);

  if (!snapshots) return <div className="text-ink-200 p-8">Loading…</div>;

  const chartData = snapshots.map(s => ({
    date: s.date.slice(5, 10),
    credit: s.totalCreditCard ?? null,
    debt: s.totalDebt,
    liquid: s.totalLiquid,
    net: s.netWorth,
  }));

  const latest = snapshots[snapshots.length - 1];
  const first = snapshots[0];
  const netDelta = latest && first ? latest.netWorth - first.netWorth : 0;
  const netPct = first && first.netWorth !== 0 ? (netDelta / Math.abs(first.netWorth)) * 100 : 0;

  if (chartData.length < 2) {
    return (
      <>
        <div className="screen-header">
          <h1 className="screen-title">Trends</h1>
          <div className="screen-meta">Snapshots are captured each payday.</div>
        </div>
        <Cell className="flex-1 grid place-items-center">
          <div className="text-center">
            <div className="text-[14px] text-ink-50 font-semibold mb-1">Not enough history yet</div>
            <div className="text-[11px] text-ink-200">Run a few paychecks on the Payday screen to build a trend.</div>
          </div>
        </Cell>
      </>
    );
  }

  return (
    <>
      <div className="screen-header">
        <h1 className="screen-title">Trends</h1>
        <div className="screen-meta">{snapshots.length} snapshot{snapshots.length === 1 ? '' : 's'} captured</div>
      </div>

      {/* Hero row: chart spans 3, summary on right */}
      <div className="bento bento-4 mb-2" style={{ minHeight: 320 }}>
        <Cell
          className="flex flex-col"
          style={{ gridColumn: '1/4' }}
          helpTitle="Balances Over Time"
          help={<>
            <p>Four series, one data point per applied paycheck:</p>
            <ul className="list-disc ml-4 space-y-0.5">
              <li><span style={{color:'#4ade80'}}>Net Worth</span> — all assets minus active debt</li>
              <li><span style={{color:'#60a5fa'}}>Liquid</span> — checking + HYSA + cash</li>
              <li><span style={{color:'#f59e0b'}}>Debt</span> — sum of every active liability</li>
              <li><span style={{color:'#ef4444'}}>Credit Cards</span> — credit-card-only debt subset</li>
            </ul>
            <p>Hover the chart for exact numbers per snapshot. Snapshots are captured automatically when you click "Apply paycheck" on the Payday screen.</p>
          </>}
        >
          <Tag>Balances Over Time</Tag>
          <div className="flex-1 mt-2 min-h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="date" stroke="#71717a" fontSize={10} />
                <YAxis stroke="#71717a" fontSize={10} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: '#141414', border: '1px solid #262626', borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => typeof v === 'number' ? `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Line type="monotone" dataKey="net" name="Net Worth" stroke="#4ade80" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="liquid" name="Liquid" stroke="#60a5fa" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="debt" name="Debt" stroke="#f59e0b" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="credit" name="Credit Cards" stroke="#ef4444" strokeWidth={2} dot={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Cell>

        {/* Net worth hero — green */}
        <Cell
          variant="green"
          className="cell-flex"
          helpTitle="Net Worth Now"
          help={<p>Latest net-worth snapshot — captured the last time you applied a paycheck. The arrow + percentage compare it to the very first snapshot in your history. If you wipe and start over, this resets too.</p>}
        >
          <div>
            <Tag onGreen>Net Worth Now</Tag>
            <div className="num-xl text-black mt-2"><Money amount={latest.netWorth} showCents={false} /></div>
          </div>
          <div>
            <div className="text-[12px] font-bold text-black">
              {netDelta >= 0 ? '↑' : '↓'} <Money amount={Math.abs(netDelta)} showCents={false} />
            </div>
            <div className="text-[10px]" style={{color:'rgba(0,0,0,0.55)'}}>
              {netPct >= 0 ? '+' : ''}{netPct.toFixed(1)}% since first snapshot
            </div>
          </div>
        </Cell>
      </div>

      {/* Latest snapshot row */}
      <div className="bento bento-4">
        <SparkStat label="Liquid" amount={latest.totalLiquid} color="#60a5fa" data={chartData.map(d => d.liquid)} />
        <SparkStat label="Debt" amount={latest.totalDebt} color="#f59e0b" data={chartData.map(d => d.debt)} />
        <SparkStat label="Credit Cards" amount={latest.totalCreditCard} color="#ef4444" data={chartData.map(d => d.credit ?? 0)} />
        <Cell className="cell-flex cell-pad-sm">
          <Tag>Last Snapshot</Tag>
          <div className="num-md text-ink-50">{latest.date.slice(5, 10)}</div>
          <div className="text-[10px] text-ink-200">Captured {latest.date.slice(0, 10)}</div>
        </Cell>
      </div>
    </>
  );
}

function SparkStat({ label, amount, color, data }: { label: string; amount: number | undefined; color: string; data: number[] }) {
  return (
    <Cell className="cell-flex cell-pad-sm">
      <Tag>{label}</Tag>
      <div className="flex items-baseline justify-between gap-2">
        <div className="num-md tabular" style={{ color }}>
          {amount == null ? <span className="text-ink-300">—</span> : <Money amount={amount} showCents={false} />}
        </div>
        {data.length > 1 && <Spark data={data.filter(d => d != null)} color={color} width={70} height={28} />}
      </div>
    </Cell>
  );
}
