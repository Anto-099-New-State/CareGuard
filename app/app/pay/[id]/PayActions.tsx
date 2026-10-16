"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { AmountField } from "@/components/ui/Field";
import { TxStatus, type TxState } from "@/components/ui/Tx";
import { api } from "@/lib/client/api";
import { formatAmount, formatMoney, parseAmount } from "@/lib/money";

export function FundForm({ episodeId, defaultCurrency, suggested, eurcAvailable }: { episodeId: string; defaultCurrency: "USDC" | "EURC"; suggested: string; eurcAvailable: boolean }) {
  const router = useRouter();
  const [currency, setCurrency] = useState<"USDC" | "EURC">(eurcAvailable ? defaultCurrency : "USDC");
  const [amount, setAmount] = useState(BigInt(suggested) > 0n ? formatAmount(BigInt(suggested)).replace(/,/g, "") : "");
  const [tx, setTx] = useState<TxState | null>(null);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    let units: bigint;
    try {
      units = parseAmount(amount);
      if (units <= 0n) throw new Error();
    } catch {
      return setError("Enter an amount like 600.00.");
    }
    setTx({ status: "pending" });
    try {
      const res = await api<{ funded: string }>(`/api/episodes/${episodeId}/fund`, { body: { amount: formatAmount(units).replace(/,/g, ""), currency } });
      setTx({ status: "confirmed" });
      setError("");
      if (currency === "EURC") setError(`${formatMoney(units, "EURC")} → ${formatMoney(BigInt(res.funded))} after the swap.`);
      router.refresh();
    } catch (err) {
      setTx({ status: "failed", error: err instanceof Error ? err.message : "Funding didn't go through." });
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 text-[13px] font-semibold">Pay in</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["EURC", "USDC"] as const).map((c) => (
            <label key={c} className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-[12px] border text-sm font-bold ${currency === c ? "border-2 border-strong bg-chip" : "border-line"} ${c === "EURC" && !eurcAvailable ? "cursor-not-allowed opacity-40" : ""}`}>
              <input type="radio" name="currency" value={c} checked={currency === c} disabled={c === "EURC" && !eurcAvailable} onChange={() => setCurrency(c)} className="sr-only" />
              {c}
            </label>
          ))}
        </div>
        {currency === "EURC" && <span className="text-xs text-muted">EURC is swapped to USDC first; the contract holds USDC only.</span>}
        {!eurcAvailable && <span className="text-xs text-muted">EURC isn&apos;t available on this network.</span>}
      </fieldset>
      <AmountField label="Amount" currency={currency} value={amount} onChange={(e) => setAmount(e.target.value)} />
      {tx && <TxStatus state={tx} label={currency === "EURC" ? "Swap and fund" : "Funding"} />}
      {error && <p className={`m-0 text-sm ${tx?.status === "confirmed" ? "text-muted" : "text-warn"}`} role={tx?.status === "confirmed" ? "status" : "alert"}>{error}</p>}
      <Button type="submit" disabled={tx?.status === "pending"} className="min-h-12 w-full text-base">
        {tx?.status === "pending" ? "Funding…" : "Fund my share"}
      </Button>
    </form>
  );
}

export function RefundExpiredButton({ episodeId }: { episodeId: string }) {
  const router = useRouter();
  const [tx, setTx] = useState<TxState | null>(null);
  const run = async () => {
    setTx({ status: "pending" });
    try {
      const res = await api<{ txHash: string }>(`/api/episodes/${episodeId}/refund-expired`, { body: {} });
      setTx({ status: "confirmed", hash: res.txHash });
      router.refresh();
    } catch (err) {
      setTx({ status: "failed", error: err instanceof Error ? err.message : "Refund didn't go through." });
    }
  };
  return (
    <div className="flex flex-col gap-3">
      {tx && <TxStatus state={tx} label="Refund" />}
      {tx?.status !== "confirmed" && <Button onClick={run} disabled={tx?.status === "pending"} className="min-h-12 w-full">Refund after expiry</Button>}
    </div>
  );
}
