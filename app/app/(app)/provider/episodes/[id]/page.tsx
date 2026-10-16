import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChargeStatus } from "@/components/ChargeStatus";
import { LiveRefresh } from "@/components/LiveRefresh";
import { StatusPill } from "@/components/StatusPill";
import { Card, EmptyState, SplitBar, Stat } from "@/components/ui/Bits";
import { Money, toUnits } from "@/components/ui/Money";
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
  const payers = view.payers as unknown as Payer[];
  const latestReason = (chargeId: string) => decisions.filter((d) => d.charge_id === chargeId).at(-1);
  const held = toUnits(ep.coverer_balance) + toUnits(ep.family_balance);
  const open = ["created", "funded", "active", "margin_call"].includes(ep.status) && ep.contract_episode_id !== null;
  const { data: items } = await db().from("price_items").select("*").eq("provider_id", ep.provider_id).eq("active", true).order("code");

  return (
    <>
      <LiveRefresh channel={`episode-${id}`} tables={["episodes", "charges", "decisions", "payers"]} episodeId={id} />
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
        <div className="flex flex-col gap-1">
          <Link href="/dashboard" className="hover-link text-xs text-muted">← All episodes</Link>
          <h1 className="m-0 font-display text-[28px] font-bold tracking-[-0.02em]">
            Episode #{ep.contract_episode_id ?? "—"} · {ep.patient_label}
          </h1>
          {ep.description && <span className="text-sm text-muted">{ep.description}</span>}
        </div>
        <div className="flex items-center gap-3">
          {ep.is_internal_test && <span className="rounded-md bg-chip px-2.5 py-[5px] text-xs font-semibold text-muted">Internal test</span>}
          <StatusPill status={ep.status} />
        </div>
      </div>

      {ep.status === "margin_call" && (
        <p role="status" className="m-0 rounded-[12px] bg-amber-bg px-4 py-3 text-sm text-amber">
          ⚠ <strong>Margin call:</strong> a payer has been asked to top up. Waiting charges are paid automatically once they do.
        </p>
      )}

      <section className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-5 rounded-[14px] border border-line p-5">
        <Stat label="Guarantee"><Money value={ep.guarantee_usdc} /></Stat>
        <Stat label="Held now"><Money value={held} /></Stat>
        <Stat label="Paid to you"><Money value={ep.paid_total} /></Stat>
        <Stat label="Per-charge cap"><Money value={ep.per_charge_cap} /></Stat>
        <Stat label="Expires">{ep.expires_at ? new Date(ep.expires_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "Not onchain yet"}</Stat>
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-start gap-5">
        <Card title="Charges" className="lg:col-span-1">
          {charges.length === 0 ? (
            <EmptyState title="No charges yet">Each charge you submit appears here with who paid which part, the agent&apos;s reason and a link to the transaction.</EmptyState>
          ) : (
            <ol className="m-0 flex list-none flex-col p-0">
              {charges.map((c) => {
                const amount = toUnits(c.amount_usdc);
                const reason = latestReason(c.id);
                return (
                  <li key={c.id} className="a-in flex flex-col gap-2 border-b border-line py-3.5 last:border-b-0">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <span className="w-8 font-mono text-sm text-muted">#{c.number}</span>
                      <span className="min-w-0 flex-1 text-sm font-semibold">
                        {c.price_items ? c.price_items.label : "Off-list charge"}
                        {c.quantity > 1 && <span className="font-normal text-muted"> × {c.quantity}</span>}
                      </span>
                      <Money value={amount} className="text-sm" />
                      <span className="w-28"><SplitBar covered={toUnits(c.covered_usdc)} total={amount} compact /></span>
                      <ChargeStatus status={c.status} />
                      <TxLink hash={c.tx_hash} label="" />
                    </div>
                    {(reason || c.reject_reason) && (
                      <p className="m-0 pl-12 text-xs leading-relaxed text-muted">{c.status === "rejected" && c.reject_reason ? `Rejected: ${c.reject_reason}` : reason?.reason}</p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          <Link href={`/episodes/${id}/log`} className="hover-link self-start text-sm font-semibold text-strong">Full decision log →</Link>
        </Card>

        <div className="flex flex-col gap-5">
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
                {payers.sort((a, b) => a.role.localeCompare(b.role)).map((p) => {
                  const funded = toUnits(p.funded_usdc);
                  const owed = toUnits(p.owed_usdc);
                  return (
                    <li key={p.id} className="flex flex-col gap-1 rounded-[12px] bg-surface p-3.5">
                      <span className="flex flex-wrap justify-between gap-2 text-sm">
                        <strong>{p.display_name} <span className="font-normal text-muted">· {p.role === "coverer" ? "Coverer" : "Family"} · {p.currency}</span></strong>
                        <span className={funded >= owed ? "text-ok" : "text-amber"}>{funded >= owed ? "✓ Funded" : funded > 0n ? "◷ Partly funded" : "◷ Not funded yet"}</span>
                      </span>
                      <span className="text-xs text-muted">Funded <Money value={funded} /> of <Money value={owed} /> · {p.email}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {payers.length > 0 && (
              <p className="m-0 text-xs text-muted">Payers fund at <code className="font-mono">/pay/{id}</code> after signing in with their email.</p>
            )}
          </Card>

          {access.provider && open && (
            <Card title="Discharge">
              <p className="m-0 text-sm text-muted">Ends treatment. Everything left returns to each payer straight away.</p>
              <DischargeButton episodeId={id} coverer={String(ep.coverer_balance)} family={String(ep.family_balance)} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
