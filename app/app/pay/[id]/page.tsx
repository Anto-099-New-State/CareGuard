import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Address } from "viem";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Logo } from "@/components/Logo";
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
import { FundForm, RefundExpiredButton } from "./PayActions";

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
  const owed = toUnits(me.owed_usdc);
  const funded = toUnits(me.funded_usdc);
  const remaining = owed > funded ? owed - funded : 0n;
  const myBalance = me.role === "coverer" ? toUnits(ep.coverer_balance) : toUnits(ep.family_balance);
  const txs = (view.transactions as unknown as Tx[]).filter((t) => t.payer_id === me.id || t.kind === "refund");
  const expiresAt = ep.expires_at ? new Date(ep.expires_at) : null;
  const chainNow = Number((await publicClient.getBlock()).timestamp) * 1000;
  const expired = expiresAt !== null && chainNow >= expiresAt.getTime();
  // After expiry funding is closed, so a top-up request no longer applies.
  const marginCall =
    ep.status === "margin_call" && !expired ? txs.filter((t) => t.kind === "margin_call" && t.payer_id === me.id && t.status === "confirmed").at(-1) : undefined;
  const open = ["created", "funded", "active", "margin_call"].includes(ep.status);
  const wallet = me.wallet_address as Address | null;
  const [usdc, eurc] = wallet ? await Promise.all([balance(config.usdc, wallet), balance(config.eurc, wallet)]) : [null, null];
  const charges = view.charges as unknown as PayerCharge[];
  const fmtDate = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="min-h-screen">
      <LiveRefresh channel={`pay-${id}`} tables={["episodes", "payers", "transactions"]} episodeId={id} />
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[560px] items-center justify-between gap-4 px-4 py-3.5">
          <Logo size="md" />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex max-w-[560px] flex-col gap-5 px-4 py-6">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted">{me.role === "coverer" ? "You cover the covered items" : "You pay what isn't covered"}</span>
          <h1 className="m-0 font-display text-[26px] leading-tight font-bold tracking-[-0.02em]">
            Treatment at {provider?.name ?? "your clinic"} · for {ep.patient_label}
          </h1>
        </div>

        {marginCall && (
          <div role="alert" className="flex flex-col gap-2 rounded-[14px] bg-amber-bg p-4 text-amber">
            <strong>⚠ Top-up needed: <Money value={marginCall.amount} /></strong>
            <span className="text-sm text-ink">Treatment costs are running ahead of the funds. Charges wait until you top up; anything unused still comes back to you.</span>
          </div>
        )}

        <dl className="m-0 flex flex-col divide-y divide-line rounded-[16px] border border-line bg-card">
          <div className="flex items-baseline justify-between gap-4 p-4">
            <dt className="text-sm font-semibold">Your share</dt>
            <dd className="m-0 text-right"><Money value={owed} className="text-lg font-semibold" /><span className="block text-xs text-muted">{me.role === "coverer" ? "covered items" : "non-covered items"} · funded <Money value={funded} /></span></dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 p-4">
            <dt className="text-sm font-semibold">Unused money</dt>
            <dd className="m-0 text-right text-sm text-muted">returned to you automatically at the end{open && myBalance > 0n && <> · <Money value={myBalance} /> held now</>}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 p-4">
            <dt className="text-sm font-semibold">Safety net</dt>
            <dd className="m-0 text-right text-sm text-muted">{expiresAt ? `refundable by you after ${fmtDate(expiresAt)}` : "set when the episode goes onchain"}</dd>
          </div>
        </dl>

        {open && !expired && ep.contract_episode_id !== null && (
          <section className="flex flex-col gap-4 rounded-[16px] border border-line bg-card p-4">
            <FundForm
              episodeId={id}
              defaultCurrency={me.currency}
              suggested={marginCall ? String(marginCall.amount) : String(remaining)}
              eurcAvailable={!/^0x0+$/.test(config.eurc)}
            />
            {wallet && (
              <div className="flex flex-col gap-1 rounded-[12px] bg-surface p-3.5 text-xs">
                <span className="font-semibold text-ink">Your CareGuard wallet</span>
                <span className="text-muted">
                  Holds <Money value={usdc ?? 0n} />{eurc !== null && <> and <Money value={eurc} currency="EURC" /></>}. Send USDC or EURC on Arc {config.network} to this address before funding:
                </span>
                <code className="font-mono break-all text-ink">{wallet}</code>
              </div>
            )}
          </section>
        )}

        {open && expired && (
          <section className="flex flex-col gap-3 rounded-[16px] border border-line bg-card p-4">
            <strong>This episode has expired</strong>
            <p className="m-0 text-sm text-muted">
              The treatment wasn&apos;t closed in time, so anyone can now return the money to the payers. You&apos;ll get back <Money value={myBalance} />.
            </p>
            <RefundExpiredButton episodeId={id} />
            {config.explorerUrl && (
              <p className="m-0 text-xs text-muted">
                You don&apos;t need us for this: call <code className="font-mono">refundExpired({ep.contract_episode_id})</code> on the{" "}
                <a className="hover-link underline" href={addressUrl(careGuard.address)} target="_blank" rel="noreferrer">contract</a> from any wallet.
              </p>
            )}
          </section>
        )}

        {!open && (
          <p role="status" className="m-0 rounded-[14px] bg-ok-bg p-4 text-sm text-ok">
            ✓ {ep.status === "closed" ? "Treatment is finished." : "The episode expired."} Everything left was returned to you.
          </p>
        )}

        <details className="rounded-[14px] border border-line p-4">
          <summary className="cursor-pointer text-sm font-semibold">How it works</summary>
          <ol className="mt-3 mb-0 flex flex-col gap-2 pl-5 text-sm leading-relaxed text-muted">
            <li>Your money is held by a contract on Arc, not by CareGuard. It can only go to {provider?.name ?? "the clinic"} for approved charges, or back to you.</li>
            <li>Each charge is checked by our agent. Charges over the cap or off the clinic&apos;s price list need a human&apos;s signature.</li>
            <li>When treatment ends, whatever is left returns to you at once. If nobody closes the episode, you can take it back yourself after the safety-net date.</li>
          </ol>
        </details>

        <details className="rounded-[14px] border border-line p-4" open={charges.length > 0}>
          <summary className="cursor-pointer text-sm font-semibold">What you&apos;re paying for ({charges.length})</summary>
          {charges.length === 0 ? (
            <p className="mt-3 mb-0 text-sm text-muted">Charges appear here as the clinic submits them, with your part of each.</p>
          ) : (
            <ul className="mt-3 mb-0 flex list-none flex-col gap-2 p-0">
              {charges.map((c) => {
                const amount = toUnits(c.amount_usdc);
                const covered = toUnits(c.covered_usdc);
                const mine = me.role === "coverer" ? covered : amount - covered;
                return (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>#{c.number} {c.price_items?.label ?? "Other"}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-muted">{c.status === "paid" ? "your part" : c.status}</span>
                      <Money value={mine} />
                      <TxLink hash={c.tx_hash} label="" />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </details>

        {txs.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="m-0 text-sm font-semibold">Your transactions</h2>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
              {txs.filter((t) => t.kind !== "margin_call").map((t, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="capitalize">{t.kind === "swap" ? "EURC → USDC swap" : t.kind}</span>
                  <span className="flex items-center gap-2">
                    {t.amount !== null && <Money value={t.amount} currency={(t.currency as "USDC" | "EURC") ?? "USDC"} />}
                    <span className={t.status === "failed" ? "text-warn" : t.status === "pending" ? "text-info" : "text-ok"}>{t.status}</span>
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
