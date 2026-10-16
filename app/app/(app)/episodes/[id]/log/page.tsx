import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/LiveRefresh";
import { EmptyState } from "@/components/ui/Bits";
import { TxLink } from "@/components/ui/Tx";
import { episodeAccess } from "@/lib/server/auth";
import { UserError } from "@/lib/server/errors";
import { episodeView } from "@/lib/server/episodes";
import { requireSession } from "@/lib/server/session";

export const metadata: Metadata = { title: "Decision log · CareGuard" };

type Decision = { id: string; kind: string; outcome: string; reason: string; hash: string; tx_hash: string | null; created_at: string };

const HEADLINE: Record<string, string> = {
  sized: "Sized the guarantee",
  pay: "Paid a charge",
  escalate: "Escalated to the approver",
  margin_call: "Asked for a top-up",
  approve: "Approver approved",
  reject: "Approver rejected",
  discharge: "Discharged",
};
const DOT: Record<string, string> = { pay: "bg-ok", approve: "bg-ok", discharge: "bg-ok", escalate: "bg-amber", margin_call: "bg-amber", reject: "bg-warn", sized: "bg-strong" };

/** Every decision: time, outcome, one plain sentence of reason, and the onchain proof. Visible to all parties. */
export default async function Log({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireSession(`/episodes/${id}/log`);
  let access;
  try {
    access = await episodeAccess(s.caller, id);
  } catch (err) {
    if (err instanceof UserError) notFound();
    throw err;
  }
  const view = await episodeView(id, access);
  const decisions = view.decisions as unknown as Decision[];
  const back = access.payer ? `/pay/${id}` : `/provider/episodes/${id}`;

  return (
    <>
      <LiveRefresh channel={`log-${id}`} tables={["decisions"]} episodeId={id} />
      <div className="flex flex-col gap-1">
        <Link href={back} className="hover-link text-xs text-muted">← Back to the episode</Link>
        <h1 className="m-0 font-display text-[28px] font-bold tracking-[-0.02em]">
          Decision log · #{view.episode.contract_episode_id ?? "—"} {view.episode.patient_label}
        </h1>
        <p className="m-0 max-w-[640px] text-sm text-muted">
          Each decision is written here with its reason before any money moves, and its salted hash is logged on Arc so anyone can check it wasn&apos;t changed.
        </p>
      </div>
      {decisions.length === 0 ? (
        <EmptyState title="No decisions yet">The agent&apos;s first entry is the guarantee sizing, as soon as the episode is created.</EmptyState>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {decisions.map((d, i) => (
            <li key={d.id} className="a-in grid grid-cols-[64px_16px_minmax(0,1fr)] gap-x-4 pb-6" style={{ animationDelay: `${i * 0.05}s` }}>
              <time dateTime={d.created_at} className="pt-0.5 font-mono text-sm text-muted">
                {new Date(d.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </time>
              <span className="relative flex justify-center" aria-hidden="true">
                <span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${DOT[d.outcome] ?? "bg-muted"}`} />
                {i < decisions.length - 1 && <span className="absolute top-5 bottom-[-24px] w-px bg-line" />}
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <strong className="text-[15px]">{HEADLINE[d.outcome] ?? d.outcome}</strong>
                <span className="text-sm leading-relaxed text-muted">{d.reason}</span>
                <span className="flex flex-wrap items-center gap-3">
                  {d.tx_hash ? <TxLink hash={d.tx_hash} /> : <span className="text-xs text-amber">◷ Not logged onchain yet</span>}
                  <span className="font-mono text-[11px] text-muted" title={d.hash}>hash {d.hash.slice(0, 10)}…</span>
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
