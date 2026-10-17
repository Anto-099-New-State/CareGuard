import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChargeStatus } from "@/components/ChargeStatus";
import { LiveRefresh } from "@/components/LiveRefresh";
import { StatusPill } from "@/components/StatusPill";
import { ButtonLink } from "@/components/ui/Button";
import { Card, EmptyState, SplitBar } from "@/components/ui/Bits";
import { Money, toUnits } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { TxLink } from "@/components/ui/Tx";
import { episodeAccess } from "@/lib/server/auth";
import { db, type PriceItemRow } from "@/lib/server/db";
import { UserError } from "@/lib/server/errors";
import { episodeView } from "@/lib/server/episodes";
import { requireSession } from "@/lib/server/session";
import { DischargeButton, SubmitCharge } from "./EpisodeActions";

export const metadata: Metadata = { title: "Episode · CareGuard" };

type Charge = {
  id: string;
  number: number;
  description: string;
  quantity: number;
  amount_usdc: number;
  covered_usdc: number;
  status: "paid" | "escalated" | "waiting" | "rejected";
  tx_hash: string | null;
  reject_reason: string | null;
  price_items: { code: string; label: string } | null;
};
type Decision = { id: string; charge_id: string | null; outcome: string; reason: string; created_at: string; tx_hash: string | null };
type Payer = { id: string; role: "coverer" | "family"; display_name: string; email: string; currency: string; wallet_address: string | null; owed_usdc: number; funded_usdc: number };

export default async function EpisodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireSession(`/provider/episodes/${id}`);
  let access;
  try {
    access = await episodeAccess(s.caller, id);
  } catch (err) {
    if (err instanceof UserError) notFound();
    throw err;
  }
  if (!access.provider && !access.approver) notFound();

  const view = await episodeView(id, access);
  const ep = view.episode;
  const charges = view.charges as unknown as Charge[];
  const decisions = view.decisions as unknown as Decision[];
  const payers = (view.payers as unknown as Payer[]).sort((a, b) => a.role.localeCompare(b.role));
  const latestReason = (chargeId: string) => decisions.filter((d) => d.charge_id === chargeId).at(-1);
  const covererBal = toUnits(ep.coverer_balance);
  const familyBal = toUnits(ep.family_balance);
  const held = covererBal + familyBal;
  const open = ["created", "funded", "active", "margin_call"].includes(ep.status) && ep.contract_episode_id !== null;
  const { data: items } = await db().from("price_items").select("*").eq("provider_id", ep.provider_id).eq("active", true).order("code");
  const paidCount = charges.filter((c) => c.status === "paid").length;

  return (
    <>
      <LiveRefresh channel={`episode-${id}`} tables={["episodes", "charges", "decisions", "payers"]} episodeId={id} />
      <PageHeader
        back={{ href: "/dashboard", label: "All episodes" }}
        title={ep.patient_label}
        meta={
          <>
            <StatusPill status={ep.status} />
            {ep.is_internal_test && <span className="rounded-full bg-chip px-2.5 py-1 text-xs font-semibold text-muted">Internal test</span>}
          </>
        }
        subtitle={`Episode #${ep.contract_episode_id ?? "—"}${ep.description ? ` · ${ep.description}` : ""}`}
        actions={
          <>
            <ButtonLink href={`/episodes/${id}/log`} variant="secondary">Decision log</ButtonLink>
            {access.provider && open && <DischargeButton episodeId={id} coverer={String(ep.coverer_balance)} family={String(ep.family_balance)} />}
          </>
        }
      />

      {ep.status === "margin_call" && (
        <p role="status" className="m-0 flex items-start gap-2.5 rounded-2xl border border-amber/30 bg-amber-bg px-4 py-3.5 text-sm text-ink">
          <span className="text-amber" aria-hidden="true">⚠</span>
          <span><strong className="text-amber">Margin call.</strong> A payer has been asked to top up. Waiting charges are paid automatically once they do.</span>
        </p>
      )}

      <section aria-label="Balances" className="grid grid-cols-2 overflow-hidden rounded-2xl border border-line bg-card lg:grid-cols-5">
        {[
          { label: "Guarantee", value: <Money value={ep.guarantee_usdc} display />, note: "Sized by the agent" },
          { label: "Held now", value: <Money value={held} display />, note: <SplitBar covered={covererBal} total={held} compact /> },
          { label: "Paid to you", value: <Money value={ep.paid_total} display />, note: `${paidCount} ${paidCount === 1 ? "charge" : "charges"}` },
          { label: "Per-charge cap", value: <Money value={ep.per_charge_cap} display />, note: "Above this, a human signs" },
          {
            label: "Expires",
            value: <span className="font-display">{ep.expires_at ? new Date(ep.expires_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</span>,
            note: "Payers can refund after this",
          },
        ].map((st, i) => (
          <div key={st.label} className={`flex min-w-0 flex-col gap-1.5 border-line p-4 sm:p-5 ${i % 2 === 0 && i < 4 ? "border-r" : ""} ${i < 4 ? "border-b lg:border-b-0" : "col-span-2 lg:col-span-1"} lg:border-r lg:last:border-r-0`}>
            <span className="eyebrow text-xs">{st.label}</span>
            <strong className="text-xl font-semibold">{st.value}</strong>
            <span className="text-xs text-muted">{st.note}</span>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card title="Charges" aside={<span className="text-xs text-muted">{charges.length} submitted</span>}>
          {charges.length === 0 ? (
            <EmptyState title="No charges yet">Each charge you submit appears here with who paid which part, the agent&apos;s reason and a link to the transaction.</EmptyState>
          ) : (
            <ol className="-mx-5 m-0 flex list-none flex-col p-0 sm:-mx-6">
              <li aria-hidden="true" className="hidden grid-cols-[36px_minmax(0,1fr)_120px_120px] gap-4 border-b border-line px-6 pb-2.5 text-xs font-semibold text-muted md:grid">
                <span>#</span><span>Item</span><span>Coverer / family</span><span className="text-right">Amount</span>
              </li>
              {charges.map((c) => {
                const amount = toUnits(c.amount_usdc);
                const covered = toUnits(c.covered_usdc);
                const reason = c.status === "rejected" && c.reject_reason ? `Rejected: ${c.reject_reason}` : latestReason(c.id)?.reason;
                return (
                  <li key={c.id} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-line px-5 py-4 last:border-b-0 sm:px-6 md:grid-cols-[36px_minmax(0,1fr)_120px_120px]">
                    <span className="self-start pt-0.5 text-sm font-semibold text-muted tabular-nums">#{c.number}</span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-semibold">
                        {c.price_items ? c.price_items.label : "Off-list charge"}
                        {c.quantity > 1 && <span className="font-normal text-muted"> × {c.quantity}</span>}
                        {c.price_items && <span className="ml-2 font-mono text-xs font-normal text-muted">{c.price_items.code}</span>}
                      </span>
                      {reason && <span className="text-xs leading-relaxed text-muted">{reason}</span>}
                    </span>
                    <span className="hidden md:block">
                      <SplitBar covered={covered} total={amount} compact />
                      <span className="mt-1 block text-xs text-muted"><Money value={covered} /> covered</span>
                    </span>
                    <span className="text-right text-sm font-semibold"><Money value={amount} /></span>
                    <span className="col-start-2 flex flex-wrap items-center gap-2">
                      <ChargeStatus status={c.status} />
                      <TxLink hash={c.tx_hash} label="Arc" />
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        <div className="flex flex-col gap-5 lg:sticky lg:top-6">
          {access.provider && open && (
            <Card title="Submit a charge">
              <SubmitCharge episodeId={id} items={((items ?? []) as PriceItemRow[]).map((i) => ({ id: i.id, code: i.code, label: i.label, unitPrice: String(i.unit_price_usdc) }))} />
            </Card>
          )}

          <Card title="Payers">
            {payers.length === 0 ? (
              <p className="m-0 text-sm text-muted">No payers yet. Add the coverer and family to put the episode onchain.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {payers.map((p) => {
                  const funded = toUnits(p.funded_usdc);
                  const owed = toUnits(p.owed_usdc);
                  const pct = owed === 0n ? 100 : Math.min(100, Number((funded * 100n) / owed));
                  return (
                    <li key={p.id} className="flex flex-col gap-2 rounded-xl bg-surface p-3.5">
                      <span className="flex items-start justify-between gap-2">
                        <span className="flex min-w-0 flex-col">
                          <strong className="truncate text-sm">{p.display_name}</strong>
                          <span className="truncate text-xs text-muted">{p.role === "coverer" ? "Coverer" : "Family"} · pays in {p.currency} · {p.email}</span>
                        </span>
                        <span className={`flex-none text-xs font-semibold ${funded >= owed ? "text-ok" : "text-amber"}`}>
                          {funded >= owed ? "✓ Funded" : funded > 0n ? "◷ Partly" : "◷ Not yet"}
                        </span>
                      </span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-chip" role="img" aria-label={`${pct}% funded`}>
                        <span className={`block h-full rounded-full ${funded >= owed ? "bg-ok" : "bg-amber"}`} style={{ width: `${pct}%` }} />
                      </span>
                      <span className="text-xs text-muted">
                        <Money value={funded} /> of <Money value={owed} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {payers.length > 0 && <p className="m-0 text-xs leading-relaxed text-muted">Payers sign in with their email and fund at <code className="font-mono break-all">/pay/{id}</code>.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
