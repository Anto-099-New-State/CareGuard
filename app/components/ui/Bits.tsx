import type { ReactNode } from "react";

/** Empty states say what will appear and how to add the first item. Never sample data. */
export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-line bg-card/60 p-7">
      <strong className="text-base">{title}</strong>
      <div className="m-0 max-w-[560px] text-sm leading-relaxed text-muted">{children}</div>
      {action}
    </div>
  );
}

export function Card({ title, children, className = "", aside }: { title?: ReactNode; children: ReactNode; className?: string; aside?: ReactNode }) {
  return (
    <section className={`flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-card p-5 sm:p-6 ${className}`}>
      {(title || aside) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="m-0 font-display text-lg font-bold tracking-[-0.01em]">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <strong className="font-display text-xl font-semibold tracking-[-0.01em]">{children}</strong>
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}

/** Covered vs family parts of an amount. Always labelled; never colour alone. */
export function SplitBar({ covered, total, compact = false }: { covered: bigint; total: bigint; compact?: boolean }) {
  const pct = total === 0n ? 0 : Number((covered * 1000n) / total) / 10;
  return (
    <div className="flex min-w-[120px] flex-col gap-1">
      <div className={`flex gap-[2px] overflow-hidden rounded-full ${compact ? "h-1.5" : "h-2.5"}`} role="img" aria-label={`${pct}% coverer, ${100 - pct}% family`}>
        {pct > 0 && <span className="bg-strong" style={{ flex: `${pct} 1 0` }} />}
        {pct < 100 && <span className="bg-accent" style={{ flex: `${100 - pct} 1 0` }} />}
      </div>
      {!compact && (
        <span className="flex justify-between gap-2 text-[11px] text-muted">
          <span>Coverer {pct}%</span>
          <span>Family {Math.round((100 - pct) * 10) / 10}%</span>
        </span>
      )}
    </div>
  );
}
