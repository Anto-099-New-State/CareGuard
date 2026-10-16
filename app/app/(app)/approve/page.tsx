import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LiveRefresh } from "@/components/LiveRefresh";
import { EmptyState } from "@/components/ui/Bits";
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
      <div className="flex flex-col gap-2">
        <h1 className="m-0 font-display text-[28px] font-bold tracking-[-0.02em]">Approvals</h1>
        <p className="m-0 max-w-[640px] text-sm leading-relaxed text-muted">
          Charges the agent wouldn&apos;t pay on its own. Approving signs a typed message in your wallet (no gas); the agent relays it to the
          contract. The approver key is <code className="font-mono">{approver}</code>.
        </p>
      </div>
      {items.length === 0 ? (
        <EmptyState title="Nothing waiting for you.">Escalated charges appear here with the agent&apos;s reason, oldest first.</EmptyState>
      ) : (
        <ApprovalQueue items={json(items) as QueueItem[]} approver={approver} />
      )}
    </>
  );
}
