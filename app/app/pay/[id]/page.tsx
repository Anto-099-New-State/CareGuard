import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Address } from "viem";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Logo } from "@/components/Logo";
import { StatusPill } from "@/components/StatusPill";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Money, toUnits } from "@/components/ui/Money";
import { TxLink } from "@/components/ui/Tx";
import { publicClient } from "@/lib/chains";
import { addressUrl, config } from "@/lib/config";
import { careGuard, erc20Abi } from "@/lib/contract";
import { episodeAccess } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { UserError } from "@/lib/server/errors";
import { episodeView } from "@/lib/server/episodes";
import { requireSession } from "@/lib/server/session";
import { ClaimRefundButton, CopyButton, FundForm, RefundExpiredButton } from "./PayActions";

export const metadata: Metadata = { title: "Fund your share · CareGuard" };

type PayerCharge = { id: string; number: number; amount_usdc: number; covered_usdc: number; status: string; tx_hash: string | null; price_items: { label: string } | null };
type Tx = { kind: string; payer_id: string | null; amount: number | null; currency: string | null; status: string; tx_hash: string | null; created_at: string };

async function balance(token: Address, owner: Address) {
  if (/^0x0+$/.test(token)) return null;
  try {
    return await publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
  } catch {
    return null;
  }
}

async function pendingRefund(owner: Address | null) {
  if (!owner) return 0n;
  try {
    return await publicClient.readContract({ ...careGuard, functionName: "pendingRefunds", args: [owner] });
  } catch {
    return 0n; // older deployment without deferred refunds
  }
}

const TX_LABEL: Record<string, string> = { fund: "Funded", swap: "EURC → USDC swap", refund: "Refund" };

export default async function Pay({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireSession(`/pay/${id}`);
  let access;
  try {
    access = await episodeAccess(s.caller, id);
  } catch (err) {
    if (err instanceof UserError) notFound();
    throw err;
  }
  const me = access.payer;
  if (!me) notFound();

  const view = await episodeView(id, access);
  const ep = view.episode;
  const { data: provider } = await db().from("providers").select("name").eq("id", ep.provider_id).single();
  const clinic = provider?.name ?? "your clinic";
  const owed = toUnits(me.owed_usdc);
  const funded = toUnits(me.funded_usdc);
  const remaining = owed > funded ? owed - funded : 0n;
  const pct = owed === 0n ? 100 : Math.min(100, Number((funded * 100n) / owed));
  const myBalance = me.role === "coverer" ? toUnits(ep.coverer_balance) : toUnits(ep.family_balance);
  const txs = (view.transactions as unknown as Tx[]).filter((t) => t.payer_id === me.id || t.kind === "refund");
  const expiresAt = ep.expires_at ? new Date(ep.expires_at) : null;
  const chainNow = Number((await publicClient.getBlock()).timestamp) * 1000;
  const expired = expiresAt !== null && chainNow >= expiresAt.getTime();
  // After expiry funding is closed, so a top-up request no longer applies.
  const marginCall =
    ep.status === "margin_call" && !expired ? txs.filter((t) => t.kind === "margin_call" && t.payer_id === me.id && t.status === "confirmed").at(-1) : undefined;
  const open = ["created", "funded", "active", "margin_call"].includes(ep.status);
  const canFund = open && !expired && ep.contract_episode_id !== null;
  const wallet = me.wallet_address as Address | null;
  const [usdc, eurc, pending] = await Promise.all([wallet ? balance(config.usdc, wallet) : null, wallet ? balance(config.eurc, wallet) : null, pendingRefund(wallet)]);
  const charges = view.charges as unknown as PayerCharge[];
  const fmtDate = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const suggested = marginCall ? toUnits(marginCall.amount) : remaining;

  return (
    <div className="min-h-screen">
      <LiveRefresh channel={`pay-${id}`} tables={["episodes", "payers", "transactions"]} episodeId={id} />
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-[600px] items-center justify-between gap-4 px-4 py-2.5">
          <Logo size="md" href="/dashboard" />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex max-w-[600px] flex-col gap-4 px-4 pt-6 pb-16">
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-2">
            <span className="eyebrow">{me.role === "coverer" ? "You pay covered items" : "You pay what isn't covered"}</span>
            <StatusPill status={ep.status} />
          </span>
          <h1 className="m-0 font-display text-[28px] leading-[1.1] font-bold tracking-[-0.025em]">
            Treatment at {clinic}
            <span className="block text-muted">for {ep.patient_label}</span>
          </h1>
        </div>

        {marginCall && (
          <div role="alert" className="flex flex-col gap-1.5 rounded-2xl border border-amber/30 bg-amber-bg p-4">
            <strong className="text-amber">⚠ Top-up needed: <Money value={marginCall.amount} /></strong>
            <span className="text-sm text-ink">Treatment costs are running ahead of the funds. Charges wait until you top up; anything unused still comes back to you.</span>
          </div>
        )}

        {pending > 0n && (
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
            <strong>A refund is waiting for you: <Money value={pending} /></strong>
            <span className="text-sm text-muted">It couldn&apos;t be sent automatically, so the contract is holding it for you. Only your wallet can collect it.</span>
            <ClaimRefundButton />
          </div>
        )}

        {/* The amount to fund is the hero. */}
        <section className="flex flex-col gap-5 rounded-3xl border border-line bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-muted">{remaining > 0n ? "Left to fund" : "Your share"}</span>
            <Money value={remaining > 0n ? remaining : owed} display className="text-[44px] leading-none font-bold" />
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-chip" role="img" aria-label={`${pct}% funded`}>
              <span className={`block h-full rounded-full ${pct >= 100 ? "bg-ok" : "bg-strong"}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-muted">
              Funded <Money value={funded} /> of <Money value={owed} />
            </span>
          </div>
          {canFund && (
            <FundForm episodeId={id} defaultCurrency={me.currency} suggested={String(suggested)} eurcAvailable={!/^0x0+$/.test(config.eurc)} />
          )}
          {open && expired && (
            <div className="flex flex-col gap-3 border-t border-line pt-5">
              <strong>This episode has expired</strong>
              <p className="m-0 text-sm text-muted">
                It wasn&apos;t closed in time, so the money can now go back to the payers. You&apos;ll get back <Money value={myBalance} />.
              </p>
              <RefundExpiredButton episodeId={id} />
              {config.explorerUrl && (
                <p className="m-0 text-xs text-muted">
                  You don&apos;t need us for this: call <code className="font-mono">refundExpired({ep.contract_episode_id})</code> on the{" "}
                  <a className="hover-link underline" href={addressUrl(careGuard.address)} target="_blank" rel="noreferrer">contract</a> from any wallet.
                </p>
              )}
            </div>
          )}
          {!open && (
            <p role="status" className="m-0 rounded-xl bg-ok-bg p-3.5 text-sm text-ok">
              ✓ {ep.status === "closed" ? "Treatment is finished." : "The episode expired."} Everything left was returned to you.
            </p>
          )}
        </section>

        <dl className="m-0 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
          {[
            { t: "Held safely", d: open && myBalance > 0n ? <>Your <Money value={myBalance} /> sits in a contract on Arc, not with us.</> : "Your money sits in a contract on Arc, not with us." },
            { t: "Unused money", d: "Comes back to you automatically when treatment ends." },
            { t: "Safety net", d: expiresAt ? `If nobody closes the episode, you can take it back after ${fmtDate(expiresAt)}.` : "Set when the episode goes onchain." },
          ].map((f) => (
            <div key={f.t} className="flex flex-col gap-1 bg-card p-4">
              <dt className="text-sm font-bold">{f.t}</dt>
              <dd className="m-0 text-xs leading-relaxed text-muted">{f.d}</dd>
            </div>
          ))}
        </dl>

        {wallet && canFund && (
          <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 text-sm">
            <span className="flex items-center justify-between gap-2">
              <strong>Your CareGuard wallet</strong>
              <CopyButton value={wallet} />
            </span>
            <code className="font-mono text-xs break-all text-ink">{wallet}</code>
            <span className="text-xs text-muted">
              Holds <Money value={usdc ?? 0n} />{eurc !== null && <> and <Money value={eurc} currency="EURC" /></>}. Send USDC or EURC on Arc {config.network} to this address, then fund above. Keep about 0.25 USDC extra: Arc network fees are paid in USDC.
            </span>
          </section>
        )}

        <details className="group rounded-2xl border border-line bg-card" open={charges.length > 0}>
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-bold">
            What you&apos;re paying for <span className="text-muted group-open:rotate-180">▾</span>
          </summary>
          <div className="border-t border-line px-4 py-3">
            {charges.length === 0 ? (
              <p className="m-0 text-sm text-muted">Charges appear here as {clinic} submits them, with your part of each.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
                {charges.map((c) => {
                  const amount = toUnits(c.amount_usdc);
                  const covered = toUnits(c.covered_usdc);
                  const mine = me.role === "coverer" ? covered : amount - covered;
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-semibold">#{c.number} {c.price_items?.label ?? "Other"}</span>
                        <span className="text-xs text-muted">{c.status === "paid" ? "Paid" : c.status === "escalated" ? "Waiting for approval" : c.status === "waiting" ? "Waiting for a top-up" : "Rejected"} · of <Money value={amount} /></span>
                      </span>
                      <span className="flex flex-none items-center gap-2">
                        <Money value={mine} className="font-semibold" />
                        <TxLink hash={c.tx_hash} label="" />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link href={`/episodes/${id}/log`} className="hover-link mt-2 inline-block text-xs font-semibold text-strong">Why each charge was paid →</Link>
          </div>
        </details>

        <details className="group rounded-2xl border border-line bg-card">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-bold">
            How it works <span className="text-muted group-open:rotate-180">▾</span>
          </summary>
          <ol className="m-0 flex flex-col gap-2 border-t border-line py-3 pr-4 pl-9 text-sm leading-relaxed text-muted">
            <li>Your money is held by a contract on Arc. It can only go to {clinic} for approved charges, or back to you.</li>
            <li>Our agent checks each charge. Anything over the cap or off the clinic&apos;s price list needs a human&apos;s signature.</li>
            <li>When treatment ends, whatever is left returns to you at once.</li>
          </ol>
        </details>

        {txs.filter((t) => t.kind !== "margin_call").length > 0 && (
          <section className="flex flex-col gap-2 px-1">
            <h2 className="eyebrow m-0">Your transactions</h2>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
              {txs.filter((t) => t.kind !== "margin_call").map((t, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{TX_LABEL[t.kind] ?? t.kind}</span>
                  <span className="flex items-center gap-2">
                    {t.amount !== null && <Money value={t.amount} currency={(t.currency as "USDC" | "EURC") ?? "USDC"} />}
                    <span className={`text-xs font-semibold ${t.status === "failed" ? "text-warn" : t.status === "pending" ? "text-info" : "text-ok"}`}>{t.status}</span>
                    <TxLink hash={t.tx_hash} label="" />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
