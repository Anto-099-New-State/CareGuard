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
import { CURRENCIES } from "@/lib/currencies";
import { convertEurc, fxAvailable, quoteEurcFor, type FxQuote } from "@/lib/client/fx";
import { formatAmount, parseAmount } from "@/lib/money";

const FEE_BUFFER = 250_000n; // keep ~0.25 USDC: Arc fees are paid in USDC and reserved up front

/** Pay-with picker: live currencies are selectable, announced ones show as coming. */
function CurrencyPicker({ value, onChange }: { value: string; onChange: (code: "USDC" | "EURC") => void }) {
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 text-sm font-bold">Pay with</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {CURRENCIES.map((c) => {
          const live = c.status === "live" && (c.route === "native" || fxAvailable);
          const on = value === c.code;
          return (
            <button
              key={c.code}
              type="button"
              disabled={!live}
              aria-pressed={on}
              onClick={() => live && onChange(c.code as "USDC" | "EURC")}
              title={live ? c.name : `${c.name}: announced for Arc, not live yet`}
              className={`flex min-h-14 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left ${
                on ? "border-strong bg-strong/10 text-ink" : live ? "cursor-pointer border-line bg-card text-ink hover:border-strong/60" : "cursor-not-allowed border-dashed border-line bg-surface text-muted"
              }`}
            >
              <span className="text-sm font-bold">
                {c.symbol} {c.code}
              </span>
              <span className="text-xs">{live ? c.name : "Coming to Arc"}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * The payer funds from their own wallet: approve USDC (if needed), call fund, then the server verifies the receipt.
 * Paying with EURC first converts just enough EURC to USDC in the same wallet (Circle App Kit), then funds in USDC.
 */
export function FundForm({ episodeId, contractEpisodeId, payerWallet, suggested }: { episodeId: string; contractEpisodeId: string; payerWallet: string; suggested: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState(BigInt(suggested) > 0n ? formatAmount(BigInt(suggested)).replace(/,/g, "") : "");
  const [ccy, setCcy] = useState<"USDC" | "EURC">("USDC");
  const [quote, setQuote] = useState<FxQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [step, setStep] = useState("");
  const [tx, setTx] = useState<TxState | null>(null);
  const [error, setError] = useState("");

  const target = (): bigint | null => {
    try {
      const u = parseAmount(amount);
      return u > 0n ? u : null;
    } catch {
      return null;
    }
  };

  const getQuote = async () => {
    setError("");
    const units = target();
    if (!units) return setError("Enter an amount like 600.00.");
    setQuoting(true);
    try {
      setQuote(await quoteEurcFor(units));
    } catch (err) {
      setError(walletMessage(err));
    } finally {
      setQuoting(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const units = target();
    if (!units) return setError("Enter an amount like 600.00.");
    if (ccy === "EURC" && !quote) return getQuote();
    setTx({ status: "pending" });
    try {
      const { wallet, address } = await connectWallet();
      if (address.toLowerCase() !== payerWallet.toLowerCase()) {
        throw new WalletError(`This treatment is funded from ${payerWallet.slice(0, 6)}…${payerWallet.slice(-4)}. Switch to that account in your wallet.`);
      }
      const total = ccy === "EURC" ? 3 : 2;
      let fx: { currencyIn: "EURC"; amountIn: string; swapTxHash: string; quotedOut: string; minOut: string; route: "appkit" } | undefined;
      let held = await publicClient.readContract({ address: config.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address] });

      if (ccy === "EURC" && quote) {
        const eurc = await publicClient.readContract({ address: config.eurc, abi: erc20Abi, functionName: "balanceOf", args: [address] });
        if (eurc < quote.amountIn) throw new WalletError(`Your wallet holds ${formatAmount(eurc)} EURC; this needs ${formatAmount(quote.amountIn)} EURC.`);
        if (held + quote.minOut < units + FEE_BUFFER) {
          throw new WalletError(`Keep about ${formatAmount(FEE_BUFFER)} USDC in your wallet as well: Arc network fees are paid in USDC, even when you pay in EURC.`);
        }
        setStep(`Step 1 of ${total}: convert ${formatAmount(quote.amountIn)} EURC to USDC (your wallet may ask to allow EURC first)`);
        const swapped = await convertEurc(quote.amountIn);
        const swapReceipt = await publicClient.waitForTransactionReceipt({ hash: swapped.txHash });
        if (swapReceipt.status !== "success") throw new WalletError("The conversion failed onchain. Your EURC wasn't spent.");
        fx = { currencyIn: "EURC", amountIn: quote.amountIn.toString(), swapTxHash: swapped.txHash, quotedOut: quote.estimatedOut.toString(), minOut: quote.minOut.toString(), route: "appkit" };
        held = await publicClient.readContract({ address: config.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address] });
      }

      if (held < units + FEE_BUFFER) {
        throw new WalletError(`Your wallet holds ${formatAmount(held)} USDC. Funding ${formatAmount(units)} USDC needs about ${formatAmount(units + FEE_BUFFER)} USDC, because Arc network fees are paid in USDC too.`);
      }
      const first = total - 1; // step number of the approval
      const allowance = await publicClient.readContract({ address: config.usdc, abi: erc20Abi, functionName: "allowance", args: [address, careGuard.address] });
      if (allowance < units) {
        setStep(`Step ${first} of ${total}: allow the CareGuard contract to take ${formatAmount(units)} USDC`);
        const approveHash = await wallet.writeContract({ account: address, chain: arc, address: config.usdc, abi: erc20Abi, functionName: "approve", args: [careGuard.address, units] });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }
      setStep(`Step ${total} of ${total}: fund your share`);
      const hash = await wallet.writeContract({ account: address, chain: arc, ...careGuard, functionName: "fund", args: [BigInt(contractEpisodeId), units] });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new WalletError("The funding transaction failed onchain. Nothing was taken.");
      setStep("");
      await api(`/api/episodes/${episodeId}/fund`, { body: { txHash: hash, fx } });
      setTx({ status: "confirmed", hash });
      setQuote(null);
      router.refresh();
    } catch (err) {
      setStep("");
      setTx({ status: "failed", error: walletMessage(err) });
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <CurrencyPicker
        value={ccy}
        onChange={(c) => {
          setCcy(c);
          setQuote(null);
        }}
      />
      <AmountField
        label="Amount to fund"
        currency="USDC"
        value={amount}
        onChange={(e) => {
          setAmount(e.target.value);
          setQuote(null);
        }}
        hint={
          ccy === "USDC"
            ? "Paid in USDC from your wallet. Keep about 0.25 USDC extra for the network fee."
            : "Your share is held in USDC. We convert just enough EURC to cover it, in your own wallet, before funding."
        }
      />
      {ccy === "EURC" && quote && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-4 text-sm" aria-live="polite">
          <span className="flex flex-wrap justify-between gap-2">
            <span className="text-muted">You convert</span>
            <strong className="amount">{formatAmount(quote.amountIn)} EURC</strong>
          </span>
          <span className="flex flex-wrap justify-between gap-2">
            <span className="text-muted">You receive about</span>
            <strong className="amount">{formatAmount(quote.estimatedOut)} USDC</strong>
          </span>
          <span className="flex flex-wrap justify-between gap-2">
            <span className="text-muted">Guaranteed at least</span>
            <span className="amount">{formatAmount(quote.minOut)} USDC</span>
          </span>
          <span className="text-xs text-muted">
            1 EURC ≈ {quote.rate.toFixed(4)} USDC · route {quote.provider} via Circle App Kit. If the price moves below the guarantee the conversion is cancelled and nothing is spent. Anything above your share stays in your wallet.
          </span>
        </div>
      )}
      {step && <p role="status" className="m-0 text-sm font-semibold text-strong">{step}</p>}
      {tx && <TxStatus state={tx} label="Funding" />}
      {error && <p role="alert" className="m-0 text-sm text-warn">{error}</p>}
      {ccy === "EURC" && !quote ? (
        <Button type="button" onClick={getQuote} disabled={quoting} className="min-h-12 w-full text-base">
          {quoting ? "Getting the EURC price…" : "See the EURC price"}
        </Button>
      ) : (
        <Button type="submit" disabled={tx?.status === "pending"} className="min-h-12 w-full text-base">
          {tx?.status === "pending" ? "Confirm in your wallet…" : ccy === "EURC" ? "Convert and fund my share" : "Fund my share"}
        </Button>
      )}
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
