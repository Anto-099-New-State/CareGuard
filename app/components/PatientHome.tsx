import Link from "next/link";
import type { Address } from "viem";
import { ClaimRefundButton, CopyButton } from "@/app/pay/[id]/PayActions";
import { publicClient } from "@/lib/chains";
import { careGuard } from "@/lib/contract";
import type { getPatientEpisodes, PayerEpisode } from "@/lib/data";
import { StatusPill } from "./StatusPill";
import { Card, EmptyState } from "./ui/Bits";
import { Money, toUnits } from "./ui/Money";
import { PageHeader } from "./ui/PageHeader";

const OPEN = new Set(["created", "funded", "active", "margin_call"]);

/** What the payer should do next on a treatment, in a few words. */
function nextStep(p: PayerEpisode, chainNow: number): { label: string; tone: "action" | "calm" | "done" } {
  const e = p.episodes;
  const left = toUnits(p.owed_usdc) - toUnits(p.funded_usdc);
  const expired = e.expires_at !== null && chainNow >= new Date(e.expires_at).getTime();
  if (!OPEN.has(e.status)) return { label: e.status === "closed" ? "Finished · leftovers returned" : "Expired · refunded", tone: "done" };
  if (expired) return { label: "Expired · take your money back", tone: "action" };
  if (e.status === "margin_call") return { label: "Top-up needed", tone: "action" };
  if (left > 0n) return { label: "Fund your share", tone: "action" };
  return { label: "Funded · treatment in progress", tone: "calm" };
}

export async function PatientHome({ name, wallet, rows, asPatient = [] }: { name: string; wallet: string; rows: PayerEpisode[]; asPatient?: Awaited<ReturnType<typeof getPatientEpisodes>> }) {
  const [chainBlock, pending] = await Promise.all([
    publicClient.getBlock(),
    publicClient.readContract({ ...careGuard, functionName: "pendingRefunds", args: [wallet as Address] }).catch(() => 0n),
  ]);
  const chainNow = Number(chainBlock.timestamp) * 1000;
  const open = rows.filter((r) => OPEN.has(r.episodes.status));
  const held = open.reduce((sum, r) => sum + toUnits(r.role === "coverer" ? r.episodes.coverer_balance : r.episodes.family_balance), 0n);
  const toFund = open.reduce((sum, r) => {
    const left = toUnits(r.owed_usdc) - toUnits(r.funded_usdc);
    return sum + (left > 0n ? left : 0n);
  }, 0n);
  const attention = rows.filter((r) => nextStep(r, chainNow).tone === "action").length + (pending > 0n ? 1 : 0);

  return (
    <>
      <PageHeader
        title={`Hello, ${name}`}
        subtitle="Treatments you're paying for. Your money is held in a contract on Arc until it's paid to the hospital for an approved charge, or returned to you."
      />

      {pending > 0n && (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
          <strong>A refund is waiting for you: <Money value={pending} /></strong>
          <span className="text-sm text-muted">It couldn&apos;t be sent automatically, so the contract is holding it. Only this wallet can collect it.</span>
          <ClaimRefundButton payerWallet={wallet} />
        </div>
      )}

      <section aria-label="Totals" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-5">
          <span className="eyebrow">Held for your treatments</span>
          <Money value={held} display className="text-[28px] font-bold" />
          <span className="text-xs text-muted">Comes back to you if it isn&apos;t used.</span>
        </div>
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-5">
          <span className="eyebrow">Still to fund</span>
          <Money value={toFund} display className="text-[28px] font-bold" />
          <span className="text-xs text-muted">Across {open.length} open {open.length === 1 ? "treatment" : "treatments"}.</span>
        </div>
        <div className={`flex flex-col gap-2 rounded-2xl p-5 ${attention > 0 ? "border border-amber/30 bg-amber-bg" : "border border-line bg-surface"}`}>
          <span className={`eyebrow ${attention > 0 ? "!text-amber" : ""}`}>Needs you</span>
          <strong className="font-display text-[28px] font-bold">{attention > 0 ? attention : "✓"}</strong>
          <span className="text-xs text-muted">{attention > 0 ? "Open the treatments marked below." : "Nothing to do right now."}</span>
        </div>
      </section>

      {asPatient.length > 0 && (
        <Card title="Treatments someone else pays for" aside={<span className="text-xs text-muted">You&apos;re the patient</span>}>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {asPatient.map((e) => (
              <li key={e.id}>
                <Link href={`/pay/${e.id}`} className="lift flex flex-col gap-2 rounded-2xl border border-line bg-card p-4 sm:p-5">
                  <span className="flex flex-wrap items-start justify-between gap-3">
                    <strong>{e.providers.name} · for {e.patient_label}</strong>
                    <StatusPill status={e.status} />
                  </span>
                  <span className="text-xs text-muted">
                    Paid by {e.payers.map((p) => p.display_name).join(" and ") || "payers not added yet"} · paid to the hospital so far <Money value={e.paid_total} />
                  </span>
                  <span className="self-start text-sm font-bold text-muted">Follow the treatment →</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Your treatments" aside={<span className="text-xs text-muted">{rows.length} in total</span>}>
        {rows.length === 0 && asPatient.length > 0 ? (
          <p className="m-0 text-sm text-muted">Nothing to fund yourself right now.</p>
        ) : rows.length === 0 ? (
          <EmptyState title="No treatments yet">
            <p className="m-0">When a hospital adds your wallet as a payer, the treatment appears here with its quote and your share. Give the hospital this address:</p>
            <span className="mt-3 flex flex-wrap items-center gap-2">
              <code className="font-mono text-xs break-all text-ink">{wallet}</code>
              <CopyButton value={wallet} />
            </span>
          </EmptyState>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {rows.map((r) => {
              const e = r.episodes;
              const owed = toUnits(r.owed_usdc);
              const funded = toUnits(r.funded_usdc);
              const pct = owed === 0n ? 100 : Math.min(100, Number((funded * 100n) / owed));
              const step = nextStep(r, chainNow);
              return (
                <li key={r.id}>
                  <Link href={`/pay/${e.id}`} className="lift flex flex-col gap-3 rounded-2xl border border-line bg-card p-4 sm:p-5">
                    <span className="flex flex-wrap items-start justify-between gap-3">
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <strong className="truncate">{e.providers.name} · for {e.patient_label}</strong>
                        <span className="text-xs text-muted">You pay {r.role === "coverer" ? "the covered items" : "what isn't covered"}</span>
                      </span>
                      <StatusPill status={e.status} />
                    </span>
                    <span className="flex flex-col gap-1.5">
                      <span className="h-1.5 overflow-hidden rounded-full bg-chip" role="img" aria-label={`${pct}% of your share funded`}>
                        <span className={`block h-full rounded-full ${pct >= 100 ? "bg-ok" : "bg-strong"}`} style={{ width: `${pct}%` }} />
                      </span>
                      <span className="flex flex-wrap justify-between gap-2 text-xs text-muted">
                        <span>Funded <Money value={funded} /> of <Money value={owed} /></span>
                        <span>Paid to the hospital so far <Money value={e.paid_total} /></span>
                      </span>
                    </span>
                    <span className={`self-start text-sm font-bold ${step.tone === "action" ? "text-strong" : step.tone === "done" ? "text-ok" : "text-muted"}`}>
                      {step.label} →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
