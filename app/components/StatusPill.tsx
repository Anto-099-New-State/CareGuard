import type { EpisodeStatus } from "@/lib/types";

// Never colour alone: every status carries a text label too.
const styles: Record<EpisodeStatus, { label: string; className: string }> = {
  created: { label: "Waiting for funds", className: "bg-amber-bg text-amber" },
  funded: { label: "Funds committed", className: "bg-info-bg text-info" },
  active: { label: "Active", className: "bg-info-bg text-info" },
  margin_call: { label: "Margin call", className: "bg-amber-bg text-amber" },
  closed: { label: "Closed", className: "bg-ok-bg text-ok" },
  expired: { label: "Expired", className: "bg-chip text-muted" },
};

export function StatusPill({ status }: { status: EpisodeStatus }) {
  const s = styles[status];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${s.className}`}>● {s.label}</span>;
}
