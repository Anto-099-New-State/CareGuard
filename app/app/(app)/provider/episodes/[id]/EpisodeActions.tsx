"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { AmountField, Field, Select } from "@/components/ui/Field";
import { TxStatus, type TxState } from "@/components/ui/Tx";
import { api } from "@/lib/client/api";
import { formatMoney } from "@/lib/money";

type Item = { id: string; code: string; label: string; unitPrice: string };
type Result = { charge: { number: number; status: string; tx_hash: string | null }; decision: { outcome: string; reason: string } | null };

const OUTCOME: Record<string, { tone: string; title: (n: number) => string }> = {
  pay: { tone: "bg-ok-bg text-ok", title: (n) => `✓ Charge #${n} paid` },
  escalate: { tone: "bg-amber-bg text-amber", title: (n) => `◷ Charge #${n} sent to the approver` },
  margin_call: { tone: "bg-amber-bg text-amber", title: (n) => `◷ Charge #${n} waits for a top-up` },
};

export function SubmitCharge({ episodeId, items }: { episodeId: string; items: Item[] }) {
  const router = useRouter();
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  const item = items.find((i) => i.id === itemId);
  const q = /^\d+$/.test(quantity) ? Number(quantity) : 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResult(null);
    if (q <= 0) return setError("Quantity must be a whole number above zero.");
    if (!item && !amount.trim()) return setError("Enter the amount for a charge that isn't on your price list.");
    setBusy(true);
    try {
      const res = await api<Result>(`/api/episodes/${episodeId}/charges`, {
        body: { priceItemId: item ? item.id : null, quantity: q, description, amount: item ? null : amount.trim() },
      });
      setResult(res);
      setDescription("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit the charge.");
    } finally {
      setBusy(false);
    }
  };

  const outcome = result?.decision ? OUTCOME[result.decision.outcome] : null;

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <Select label="Item" value={itemId} onChange={(e) => setItemId(e.target.value)}>
        {items.map((i) => (
          <option key={i.id} value={i.id}>{i.code} · {i.label} · {formatMoney(BigInt(i.unitPrice))}</option>
        ))}
        <option value="">Not on my price list…</option>
      </Select>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantity" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        {item ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">Amount</span>
            <span className="flex min-h-11 items-center font-mono text-sm">{formatMoney(BigInt(item.unitPrice) * BigInt(q))}</span>
          </div>
        ) : (
          <AmountField label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        )}
      </div>
      <Field label="Note (only you and the approver see it)" value={description} onChange={(e) => setDescription(e.target.value)} />
      {error && <p role="alert" className="m-0 text-sm text-warn">{error}</p>}
      {result && outcome && (
        <div role="status" className={`flex flex-col gap-1 rounded-[10px] px-3.5 py-2.5 text-sm ${outcome.tone}`}>
          <strong>{outcome.title(result.charge.number)}</strong>
          <span className="text-ink">{result.decision!.reason}</span>
        </div>
      )}
      <Button type="submit" disabled={busy} className="self-start">{busy ? "Agent is reviewing…" : "Submit charge"}</Button>
    </form>
  );
}

export function DischargeButton({ episodeId, coverer, family }: { episodeId: string; coverer: string; family: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [tx, setTx] = useState<TxState | null>(null);
  const sentence = `Discharge: return ${formatMoney(BigInt(coverer))} to the coverer and ${formatMoney(BigInt(family))} to family.`;

  const run = async () => {
    setTx({ status: "pending" });
    try {
      const res = await api<{ txHash: string }>(`/api/episodes/${episodeId}/discharge`, { body: {} });
      setTx({ status: "confirmed", hash: res.txHash });
      router.refresh();
    } catch (err) {
      setTx({ status: "failed", error: err instanceof Error ? err.message : "Couldn't discharge." });
    }
  };

  if (tx) return <TxStatus state={tx} label="Discharge" />;
  if (!confirming) return <Button variant="secondary" className="self-start" onClick={() => setConfirming(true)}>Discharge…</Button>;
  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-line p-4">
      <p className="m-0 text-sm font-semibold">{sentence}</p>
      <p className="m-0 text-xs text-muted">This can&apos;t be undone. Charges still waiting for approval won&apos;t be paid.</p>
      <div className="flex gap-3">
        <Button onClick={run}>Discharge and refund</Button>
        <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
      </div>
    </div>
  );
}
