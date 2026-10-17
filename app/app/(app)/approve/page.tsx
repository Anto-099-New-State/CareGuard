import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LiveRefresh } from "@/components/LiveRefresh";
import { EmptyState } from "@/components/ui/Bits";
import { PageHeader } from "@/components/ui/PageHeader";
import { publicClient } from "@/lib/chains";
import { careGuard } from "@/lib/contract";
import { listApprovals } from "@/lib/server/episodes";
import { requireSession } from "@/lib/server/session";
import { ApprovalQueue, type QueueItem } from "./ApprovalQueue";

export const metadata: Metadata = { title: "Approvals · CareGuard" };

const json = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));

export default async function Approve() {
  const s = await requireSession("/approve");
  if (!s.approver) redirect("/dashboard");
  const [items, approver] = await Promise.all([listApprovals(), publicClient.readContract({ ...careGuard, functionName: "approver" })]);

  return (
    <>
      <LiveRefresh channel="approvals" tables={["charges"]} />
      <PageHeader
        title="Approvals"
        meta={items.length > 0 ? <span className="rounded-full bg-amber-bg px-2.5 py-1 text-xs font-semibold text-amber">{items.length} waiting</span> : undefined}
        subtitle="Charges the agent wouldn't pay on its own, oldest first. Approving signs a typed message in your wallet; the agent relays it to the contract."
      />
      <p className="m-0 -mt-4 text-xs text-muted">
        Approver key onchain: <code className="font-mono break-all">{approver}</code>
      </p>
      {items.length === 0 ? (
        <EmptyState title="Nothing waiting for you.">Escalated charges appear here with the agent&apos;s reason, oldest first.</EmptyState>
      ) : (
        <ApprovalQueue items={json(items) as QueueItem[]} approver={approver} />
      )}
    </>
  );
}
