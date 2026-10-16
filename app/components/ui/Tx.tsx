import { config, txUrl } from "@/lib/config";

/** Explorer link for a transaction hash. Locally there's no explorer, so it shows the short hash. */
export function TxLink({ hash, label = "View on Arc" }: { hash: string | null | undefined; label?: string }) {
  if (!hash) return null;
  const short = `${hash.slice(0, 6)}…${hash.slice(-4)}`;
  const url = txUrl(hash);
  if (!url) return <span className="font-mono text-xs text-muted" title={hash}>{short}</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="hover-link inline-flex items-center gap-1 text-xs font-semibold text-strong" title={hash}>
      {label} <span aria-hidden="true">↗</span>
      <span className="sr-only">(opens {config.network} explorer)</span>
    </a>
  );
}

export type TxState = { status: "pending" | "confirmed" | "failed"; hash?: string | null; error?: string | null };

/** Every transaction state is visible: pending → confirmed with a link → failed with a plain reason. */
export function TxStatus({ state, label }: { state: TxState; label: string }) {
  if (state.status === "pending") {
    return (
      <p role="status" className="m-0 flex items-center gap-2 rounded-[10px] bg-info-bg px-3.5 py-2.5 text-sm text-info">
        <span className="a-blink h-2 w-2 rounded-full bg-current" aria-hidden="true" /> {label}: pending…
      </p>
    );
  }
  if (state.status === "confirmed") {
    return (
      <p role="status" className="m-0 flex flex-wrap items-center gap-2 rounded-[10px] bg-ok-bg px-3.5 py-2.5 text-sm text-ok">
        <span aria-hidden="true">✓</span> {label}: confirmed <TxLink hash={state.hash} />
      </p>
    );
  }
  return (
    <p role="alert" className="m-0 rounded-[10px] bg-warn-bg px-3.5 py-2.5 text-sm text-warn">
      <span aria-hidden="true">✕</span> {label} failed: {state.error ?? "unknown reason."}
    </p>
  );
}
