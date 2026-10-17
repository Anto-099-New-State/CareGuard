const styles = {
  paid: { label: "✓ Paid", className: "bg-ok-bg text-ok" },
  escalated: { label: "◷ Waiting for approval", className: "bg-amber-bg text-amber" },
  waiting: { label: "◷ Waiting for top-up", className: "bg-amber-bg text-amber" },
  rejected: { label: "✕ Rejected", className: "bg-warn-bg text-warn" },
} as const;

/** Charge status with an icon and words, never colour alone. Red is used for rejected only. */
export function ChargeStatus({ status }: { status: keyof typeof styles }) {
  const s = styles[status];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${s.className}`}>{s.label}</span>;
}
