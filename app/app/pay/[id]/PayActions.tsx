"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { AmountField } from "@/components/ui/Field";
import { TxStatus, type TxState } from "@/components/ui/Tx";
import { api } from "@/lib/client/api";
import { arc } from "@/lib/chains";
import { connectWallet, publicClient, WalletError, walletMessage } from "@/lib/client/wallet";
import { config } from "@/lib/config";
import { careGuard, erc20Abi } from "@/lib/contract";
import { formatAmount, parseAmount } from "@/lib/money";

const FEE_BUFFER = 250_000n; // keep ~0.25 USDC: Arc fees are paid in USDC and reserved up front

/** The payer funds from their own wallet: approve USDC (if needed), call fund, then the server verifies the receipt. */
export function FundForm({ episodeId, contractEpisodeId, payerWallet, suggested }: { episodeId: string; contractEpisodeId: string; payerWallet: string; suggested: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState(BigInt(suggested) > 0n ? formatAmount(BigInt(suggested)).replace(/,/g, "") : "");
  const [step, setStep] = useState("");
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
      const { wallet, address } = await connectWallet();
      if (address.toLowerCase() !== payerWallet.toLowerCase()) {
        throw new WalletError(`This treatment is funded from ${payerWallet.slice(0, 6)}…${payerWallet.slice(-4)}. Switch to that account in your wallet.`);
      }
      const held = await publicClient.readContract({ address: config.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address] });
      if (held < units + FEE_BUFFER) {
        throw new WalletError(`Your wallet holds ${formatAmount(held)} USDC. Funding ${formatAmount(units)} USDC needs about ${formatAmount(units + FEE_BUFFER)} USDC, because Arc network fees are paid in USDC too.`);
      }
      const allowance = await publicClient.readContract({ address: config.usdc, abi: erc20Abi, functionName: "allowance", args: [address, careGuard.address] });
      if (allowance < units) {
        setStep("Step 1 of 2: allow the CareGuard contract to take this amount");
        const approveHash = await wallet.writeContract({ account: address, chain: arc, address: config.usdc, abi: erc20Abi, functionName: "approve", args: [careGuard.address, units] });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }
      setStep(allowance < units ? "Step 2 of 2: fund your share" : "Fund your share");
      const hash = await wallet.writeContract({ account: address, chain: arc, ...careGuard, functionName: "fund", args: [BigInt(contractEpisodeId), units] });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new WalletError("The funding transaction failed onchain. Nothing was taken.");
      setStep("");
      await api(`/api/episodes/${episodeId}/fund`, { body: { txHash: hash } });
      setTx({ status: "confirmed", hash });
      router.refresh();
    } catch (err) {
      setStep("");
      setTx({ status: "failed", error: walletMessage(err) });
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <AmountField label="Amount" currency="USDC" value={amount} onChange={(e) => setAmount(e.target.value)} hint="Paid in USDC from your wallet. Keep about 0.25 USDC extra for the network fee." />
      {step && <p role="status" className="m-0 text-sm font-semibold text-strong">{step}</p>}
      {tx && <TxStatus state={tx} label="Funding" />}
      {error && <p role="alert" className="m-0 text-sm text-warn">{error}</p>}
      <Button type="submit" disabled={tx?.status === "pending"} className="min-h-12 w-full text-base">
        {tx?.status === "pending" ? "Confirm in your wallet…" : "Fund my share"}
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

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked: the address is still selectable on the page.
        }
      }}
      className="min-h-9 cursor-pointer rounded-full border border-line bg-card px-3 text-xs font-bold text-ink"
    >
      <span aria-live="polite">{copied ? "✓ Copied" : "Copy address"}</span>
    </button>
  );
}

/** Collects a refund the contract couldn't send automatically. Only the payer's own wallet can call it. */
export function ClaimRefundButton({ payerWallet }: { payerWallet: string }) {
  const router = useRouter();
  const [tx, setTx] = useState<TxState | null>(null);
  const run = async () => {
    setTx({ status: "pending" });
    try {
      const { wallet, address } = await connectWallet();
      if (address.toLowerCase() !== payerWallet.toLowerCase()) throw new WalletError(`Switch to ${payerWallet.slice(0, 6)}…${payerWallet.slice(-4)} in your wallet to claim.`);
      const hash = await wallet.writeContract({ account: address, chain: arc, ...careGuard, functionName: "claimRefund", args: [] });
      await publicClient.waitForTransactionReceipt({ hash });
      setTx({ status: "confirmed", hash });
      router.refresh();
    } catch (err) {
      setTx({ status: "failed", error: walletMessage(err) });
    }
  };
  return (
    <div className="flex flex-col gap-3">
      {tx && <TxStatus state={tx} label="Refund" />}
      {tx?.status !== "confirmed" && <Button onClick={run} disabled={tx?.status === "pending"} className="self-start">Claim my refund</Button>}
    </div>
  );
}
