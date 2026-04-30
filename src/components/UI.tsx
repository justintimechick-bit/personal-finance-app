// Shared bento UI primitives. Replaces the old card/StatCard pattern.
// Cell is the workhorse: dark surface (default), green accent, or warn.

import { useEffect, useState } from 'react';
import { fmt } from '../core/dates';
import type { ReactNode, CSSProperties } from 'react';

// ─── Cell ─────────────────────────────────────────────────────
export function Cell({
  variant = 'default',
  className = '',
  style,
  help,
  helpTitle,
  children,
}: {
  variant?: 'default' | 'green' | 'warn';
  className?: string;
  style?: CSSProperties;
  /** When set, a small "?" badge appears in the top-right; clicking opens an info popup. */
  help?: ReactNode;
  /** Optional title for the popup; defaults to "About this cell". */
  helpTitle?: string;
  children: ReactNode;
}) {
  const v = variant === 'green' ? 'cell-green'
          : variant === 'warn'  ? 'cell-warn'
          : '';
  const onGreen = variant === 'green';
  return (
    <div className={`cell ${v} ${className} ${help ? 'relative' : ''}`} style={style}>
      {children}
      {help && <CellHelpBadge title={helpTitle} body={help} onGreen={onGreen} />}
    </div>
  );
}

// ─── CellHelpBadge ─────────────────────────────────────────────
// A small "?" button in the cell's top-right that opens a centered popup.
function CellHelpBadge({ title, body, onGreen }: { title?: string; body: ReactNode; onGreen?: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="What is this?"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={`absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors ${
          onGreen
            ? 'bg-black/15 text-black/70 hover:bg-black/25'
            : 'bg-ink-700 text-ink-200 hover:bg-ink-600 hover:text-ink-50'
        }`}
      >
        ?
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/70 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-ink-800 border border-ink-600 rounded-cell shadow-2xl max-w-md w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="text-sm font-semibold text-ink-50">{title ?? 'About this cell'}</div>
              <button
                className="text-ink-400 hover:text-ink-50 text-lg leading-none"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >×</button>
            </div>
            <div className="text-xs text-ink-200 leading-relaxed space-y-2">{body}</div>
            <div className="text-[10px] text-ink-400 mt-3">Press Esc or click outside to close.</div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Tag (microlabel) ─────────────────────────────────────────
export function Tag({ children, onGreen = false, className = '' }: {
  children: ReactNode; onGreen?: boolean; className?: string;
}) {
  return <span className={`${onGreen ? 'tag-on-green' : 'tag'} ${className}`}>{children}</span>;
}

// ─── Money ────────────────────────────────────────────────────
export function Money({ amount, className = '', showCents = true, showSign = false }: {
  amount: number; className?: string; showCents?: boolean; showSign?: boolean;
}) {
  return <span className={`tabular ${className}`}>{fmt(amount, { showCents, showSign })}</span>;
}

// ─── Currency input ───────────────────────────────────────────
export function CurrencyInput({
  value, onChange, placeholder = '0.00', className = '',
}: {
  value: number; onChange: (v: number) => void; placeholder?: string; className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-200 text-[13px]">$</span>
      <input
        type="number"
        step="0.01"
        className="input pl-7 text-right"
        value={isNaN(value) || value === 0 ? '' : value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        placeholder={placeholder}
      />
    </div>
  );
}

// ─── Sparkline ────────────────────────────────────────────────
export function Spark({ data, color = '#4ade80', width = 100, height = 36, strokeWidth = 2 }: {
  data: number[]; color?: string; width?: number; height?: number; strokeWidth?: number;
}) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`
  ).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" aria-hidden>
      <polyline points={pts} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ─── Bar ──────────────────────────────────────────────────────
export function Bar({ value, max, tone = 'accent', height = 5 }: {
  value: number; max: number; tone?: 'accent' | 'warn' | 'danger' | 'info'; height?: number;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = tone === 'warn' ? '#f59e0b'
              : tone === 'danger' ? '#ef4444'
              : tone === 'info' ? '#60a5fa'
              : '#4ade80';
  return (
    <div className="bar" style={{ height }}>
      <div style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

// ─── Progress (legacy alias) ──────────────────────────────────
export const Progress = Bar;

// ─── Section heading (used outside bento, e.g. for fallback) ──
export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[14px] font-bold tracking-tight text-ink-50">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// ─── StatCard (legacy alias built on Cell) ────────────────────
export function StatCard({ label, value, subtext, tone = 'default' }: {
  label: string; value: string | number; subtext?: string;
  tone?: 'default' | 'accent' | 'warn' | 'danger';
}) {
  const numClass = tone === 'accent' ? 'text-accent'
                : tone === 'warn'   ? 'text-warn'
                : tone === 'danger' ? 'text-danger'
                : 'text-ink-50';
  return (
    <Cell className="cell-flex cell-pad-sm">
      <Tag>{label}</Tag>
      <div className={`num-md ${numClass}`}>
        {typeof value === 'number' ? fmt(value, { showCents: false }) : value}
      </div>
      {subtext && <div className="text-[10px] text-ink-200">{subtext}</div>}
    </Cell>
  );
}
