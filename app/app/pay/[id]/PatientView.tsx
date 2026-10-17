import Link from "next/link";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Logo } from "@/components/Logo";
import { StatusPill } from "@/components/StatusPill";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Money, toUnits } from "@/components/ui/Money";
import { TxLink } from "@/components/ui/Tx";

type Charge = { id: string; number: number; amount_usdc: number; status: string; tx_hash: string | null; price_items: { label: string } | null };
type Payer = { role: "coverer" | "family"; display_name: string; owed_usdc: number; funded_usdc: number };
type QuoteLine = { priceItemId: string; label: string; unitPrice: bigint; quantity: number };

const STATUS: Record<string, string> = { paid: "Paid", escalated: "Waiting for approval", waiting: "Waiting for a top-up", rejected: "Rejected" };

/** Read-only view for the patient when someone else pays: progress, who pays, the quote and each charge. */
export function PatientView({
  episodeId,
  clinic,
  episode,
  payers,
  charges,
  quote,
}: {
  episodeId: string;
  clinic: string;
  episode: { patient_label: string; status: "created" | "funded" | "active" | "margin_call" | "closed" | "expired"; guarantee_usdc: number | null; paid_total: number; quote_usdc: number };
  payers: Payer[];
  charges: Charge[];
  quote: QuoteLine[];
}) {
  return (
    <div className="min-h-screen">
      <LiveRefresh channel={`patient-${episodeId}`} tables={["episodes", "charges", "payers"]} episodeId={episodeId} />
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-[600px] items-center justify-between gap-4 px-4 py-2.5">
          <Logo size="md" href="/dashboard" />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto flex max-w-[600px] flex-col gap-4 px-4 pt-6 pb-16">
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-2">
            <span className="eyebrow">Your treatment</span>
            <StatusPill status={episode.status} />
          </span>
          <h1 className="m-0 font-display text-[28px] leading-[1.1] font-bold tracking-[-0.025em]">
            {clinic}
            <span className="block text-muted">for {episode.patient_label}</span>
          </h1>
          <p className="m-0 text-sm leading-relaxed text-muted">Someone else is paying for this treatment. You can follow every charge here; nothing needs your action.</p>
        </div>

        <section className="flex flex-col gap-3 rounded-3xl border border-line bg-card p-5">
          <span className="text-sm font-semibold text-muted">Paid to {clinic} so far</span>
          <Money value={episode.paid_total} display className="text-[40px] leading-none font-bold" />
          <span className="text-xs text-muted">of a <Money value={episode.guarantee_usdc} /> guarantee. Anything unused goes back to the payers.</span>
        </section>

        <section className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-4">
          <h2 className="eyebrow m-0">Who pays</h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
            {payers.sort((a, b) => a.role.localeCompare(b.role)).map((p) => (
              <li key={p.role} className="flex justify-between gap-3">
                <span>
                  <strong>{p.display_name}</strong> <span className="text-muted">· {p.role === "coverer" ? "covered items" : "everything else"}</span>
                </span>
                <span className="text-muted">
                  <Money value={p.funded_usdc} /> of <Money value={p.owed_usdc} />
                </span>
              </li>
            ))}
          </ul>
        </section>

        {quote.length > 0 && (
          <details className="group rounded-2xl border border-line bg-card">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-bold">
              Quote from {clinic} <span className="text-muted group-open:rotate-180">▾</span>
            </summary>
            <ul className="m-0 flex list-none flex-col divide-y divide-line border-t border-line px-4 py-1">
              {quote.map((q) => (
                <li key={q.priceItemId} className="flex justify-between gap-3 py-2.5 text-sm">
                  <span>{q.label} <span className="text-muted">× {q.quantity}</span></span>
                  <Money value={q.unitPrice * BigInt(q.quantity)} />
                </li>
              ))}
              <li className="flex justify-between gap-3 py-2.5 text-sm font-semibold">
                <span>Quote</span>
                <Money value={episode.quote_usdc} />
              </li>
            </ul>
          </details>
        )}

        <details className="group rounded-2xl border border-line bg-card" open>
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-bold">
            Charges ({charges.length}) <span className="text-muted group-open:rotate-180">▾</span>
          </summary>
          <div className="border-t border-line px-4 py-3">
            {charges.length === 0 ? (
              <p className="m-0 text-sm text-muted">Charges appear here as {clinic} submits them.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
                {charges.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-semibold">#{c.number} {c.price_items?.label ?? "Other"}</span>
                      <span className="text-xs text-muted">{STATUS[c.status] ?? c.status}</span>
                    </span>
                    <span className="flex flex-none items-center gap-2">
                      <Money value={toUnits(c.amount_usdc)} className="font-semibold" />
                      <TxLink hash={c.tx_hash} label="" />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/episodes/${episodeId}/log`} className="hover-link mt-2 inline-block text-xs font-semibold text-strong">Why each charge was paid →</Link>
          </div>
        </details>
      </main>
    </div>
  );
}
