"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createWalletClient, custom, type Address, type EIP1193Provider, type Hex } from "viem";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Money } from "@/components/ui/Money";
import { arc } from "@/lib/chains";
import { api } from "@/lib/client/api";

export type QueueItem = {
  charge: { id: string; number: number; amount_usdc: number; covered_usdc: number; description: string; created_at: string };
  episode: { id: string; contractEpisodeId: number | null; patientLabel: string };
  reason: string;
  request: {
    domain: { name: string; version: string; chainId: string | number; verifyingContract: Address };
    types: { ApproveCharge: { name: string; type: string }[] };
    primaryType: "ApproveCharge";
    message: { episodeId: string; chargeHash: Hex; amount: string; coveredAmount: string; deadline: string };
    consequence: string;
  };
};

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

const age = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

/** Signs ApproveCharge with the browser wallet. The approver key never reaches our server. */
async function signApproval(item: QueueItem, approver: Address): Promise<Hex> {
  if (!window.ethereum) throw new Error("No browser wallet found. Install one (e.g. MetaMask) and import the approver key there.");
  const wallet = createWalletClient({ chain: arc, transport: custom(window.ethereum) });
  const [account] = await wallet.requestAddresses();
  if (account.toLowerCase() !== approver.toLowerCase()) {
    throw new Error(`Your wallet is on ${account}. Switch to the approver account ${approver} and try again.`);
  }
  try {
    await wallet.switchChain({ id: arc.id });
  } catch {
    await wallet.addChain({ chain: arc });
  }
  const m = item.request.message;
  return wallet.signTypedData({
    account,
    domain: { ...item.request.domain, chainId: Number(item.request.domain.chainId) },
    types: item.request.types,
    primaryType: "ApproveCharge",
    message: { episodeId: BigInt(m.episodeId), chargeHash: m.chargeHash, amount: BigInt(m.amount), coveredAmount: BigInt(m.coveredAmount), deadline: BigInt(m.deadline) },
  });
}

function Row({ item, approver, onDone }: { item: QueueItem; approver: Address; onDone: () => void }) {
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const approve = async () => {
    setBusy(true);
    setError("");
    try {
      const signature = await signApproval(item, approver);
      await api(`/api/approvals/${item.charge.id}`, { body: { verdict: "approve", signature, deadline: item.request.message.deadline } });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0] : "Approval failed.");
      setBusy(false);
    }
  };

  const reject = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/approvals/${item.charge.id}`, { body: { verdict: "reject", reason } });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reject.");
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col gap-3 border-b border-line px-4 py-4 last:border-b-0 focus-within:bg-surface">
      <div className="grid grid-cols-[56px_minmax(0,1fr)_auto_48px] items-baseline gap-4 max-sm:grid-cols-[48px_minmax(0,1fr)]">
        <span className="font-mono text-sm text-muted">#{item.charge.number}</span>
        <div className="flex min-w-0 flex-col gap-1">
          <Link href={`/provider/episodes/${item.episode.id}`} className="hover-link text-sm font-semibold">
            Episode #{item.episode.contractEpisodeId} · {item.episode.patientLabel}
          </Link>
          <span className="text-sm text-muted">{item.reason}</span>
          {item.charge.description && <span className="text-xs text-muted">Provider note: {item.charge.description}</span>}
        </div>
        <Money value={item.charge.amount_usdc} className="text-sm font-semibold max-sm:col-start-2" />
        <span className="text-right text-xs text-muted max-sm:hidden" title={new Date(item.charge.created_at).toLocaleString()}>{age(item.charge.created_at)}</span>
      </div>

      {mode === "idle" && (
        <div className="flex gap-2 pl-[72px] max-sm:pl-0">
          <Button onClick={() => setMode("approve")}>Approve…</Button>
          <Button variant="secondary" onClick={() => setMode("reject")}>Reject…</Button>
        </div>
      )}
      {mode === "approve" && (
        <div className="flex flex-col gap-3 rounded-[12px] border border-line bg-card p-4 sm:ml-[72px]">
          <p className="m-0 text-sm font-semibold">{item.request.consequence}</p>
          <p className="m-0 text-xs text-muted">Your wallet will ask you to sign. The signature is valid until {new Date(Number(item.request.message.deadline) * 1000).toLocaleTimeString()}.</p>
          <div className="flex gap-2">
            <Button onClick={approve} disabled={busy}>{busy ? "Waiting for wallet…" : "Sign and approve"}</Button>
            <Button variant="ghost" onClick={() => setMode("idle")} disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}
      {mode === "reject" && (
        <form onSubmit={reject} className="flex flex-col gap-3 rounded-[12px] border border-line bg-card p-4 sm:ml-[72px]">
          <Field label="Reason the provider will see" required value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          <div className="flex gap-2">
            <Button type="submit" variant="danger" disabled={busy || !reason.trim()}>{busy ? "Rejecting…" : `Reject #${item.charge.number}`}</Button>
            <Button variant="ghost" onClick={() => setMode("idle")} disabled={busy}>Cancel</Button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="m-0 text-sm text-warn sm:pl-[72px]">{error}</p>}
    </li>
  );
}

export function ApprovalQueue({ items, approver }: { items: QueueItem[]; approver: Address }) {
  const router = useRouter();
  return (
    <ul className="m-0 list-none rounded-[14px] border border-line p-0">
      {items.map((item) => (
        <Row key={item.charge.id} item={item} approver={approver} onDone={() => router.refresh()} />
      ))}
    </ul>
  );
}
