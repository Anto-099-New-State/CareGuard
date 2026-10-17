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
  charge: { id: string; number: number; amount_usdc: number; covered_usdc: number; description: string; created_at: string; price_items: { code: string; label: string } | null };
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
    <li className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5 focus-within:border-strong">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-1.5">
          <span className="flex flex-wrap items-center gap-2">
            <strong className="text-[15px]">
              #{item.charge.number} {item.charge.price_items?.label ?? "Off-list charge"}
            </strong>
            {item.charge.price_items && <span className="font-mono text-[11px] text-muted">{item.charge.price_items.code}</span>}
            <span className="text-xs text-muted" title={new Date(item.charge.created_at).toLocaleString()}>· waiting {age(item.charge.created_at)}</span>
          </span>
          <p className="m-0 flex gap-2 rounded-xl bg-amber-bg px-3 py-2 text-sm text-ink">
            <span className="flex-none font-semibold text-amber">Agent:</span>
            {item.reason}
          </p>
          {item.charge.description && <span className="text-xs text-muted">Provider note: {item.charge.description}</span>}
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <Money value={item.charge.amount_usdc} display className="text-2xl font-bold" />
          <span className="text-xs text-muted">
            <Money value={item.charge.covered_usdc} /> coverer · <Money value={BigInt(String(item.charge.amount_usdc)) - BigInt(String(item.charge.covered_usdc))} /> family
          </span>
        </div>
      </div>

      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setMode("approve")}>Approve…</Button>
          <Button variant="secondary" onClick={() => setMode("reject")}>Reject…</Button>
        </div>
      )}
      {mode === "approve" && (
        <div className="flex flex-col gap-3 rounded-xl border border-strong/40 bg-surface p-4">
          <p className="m-0 text-sm font-semibold">{item.request.consequence}</p>
          <p className="m-0 text-xs text-muted">Your wallet will ask you to sign (no gas). The signature is valid until {new Date(Number(item.request.message.deadline) * 1000).toLocaleTimeString()}.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={approve} disabled={busy}>{busy ? "Waiting for wallet…" : "Sign and approve"}</Button>
            <Button variant="ghost" onClick={() => setMode("idle")} disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}
      {mode === "reject" && (
        <form onSubmit={reject} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          <Field label="Reason the provider will see" required value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" disabled={busy || !reason.trim()}>{busy ? "Rejecting…" : `Reject #${item.charge.number}`}</Button>
            <Button variant="ghost" onClick={() => setMode("idle")} disabled={busy}>Cancel</Button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="m-0 text-sm text-warn">{error}</p>}
    </li>
  );
}

export function ApprovalQueue({ items, approver }: { items: QueueItem[]; approver: Address }) {
  const router = useRouter();
  const groups = [...new Map(items.map((i) => [i.episode.id, i.episode])).values()].map((ep) => ({ ep, items: items.filter((i) => i.episode.id === ep.id) }));
  return (
    <div className="flex flex-col gap-7">
      {groups.map(({ ep, items: list }) => (
        <section key={ep.id} aria-labelledby={`ep-${ep.id}`} className="flex flex-col gap-3">
          <h2 id={`ep-${ep.id}`} className="m-0 flex flex-wrap items-baseline gap-2 text-sm">
            <Link href={`/provider/episodes/${ep.id}`} className="hover-link font-display text-lg font-bold">
              {ep.patientLabel}
            </Link>
            <span className="text-muted">Episode #{ep.contractEpisodeId} · {list.length} waiting</span>
          </h2>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {list.map((item) => (
              <Row key={item.charge.id} item={item} approver={approver} onDone={() => router.refresh()} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
