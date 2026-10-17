import type { Metadata } from "next";
import Link from "next/link";
import { EpisodesTable } from "@/components/EpisodesTable";
import { LiveRefresh } from "@/components/LiveRefresh";
import { ProviderSetup } from "@/components/ProviderSetup";
import { StatusPill } from "@/components/StatusPill";
import { ButtonLink } from "@/components/ui/Button";
import { Card, EmptyState } from "@/components/ui/Bits";
import { Money, toUnits } from "@/components/ui/Money";
import { PageHeader } from "@/components/ui/PageHeader";
import { TxLink } from "@/components/ui/Tx";
import { getDashboard, getPayerEpisodes } from "@/lib/data";
import { formatAmount } from "@/lib/money";
import { requireSession } from "@/lib/server/session";
import type { EpisodeSummary } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard · CareGuard" };

const OPEN = new Set(["created", "funded", "active", "margin_call"]);
const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);
const held = (e: EpisodeSummary) => e.covererBalance + e.familyBalance;
const share = (part: bigint, total: bigint) => (total === 0n ? 0 : Number((part * 1000n) / total) / 10);

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function Dashboard() {
  const s = await requireSession("/dashboard");
  const payerEpisodes = await getPayerEpisodes(s);

  if (!s.provider) {
    return (
      <>
        <PageHeader title="Welcome to CareGuard" subtitle="Escrow for medical treatment: the money is committed before treatment and paid one approved charge at a time." />
        {s.approver && (
          <Card title="You're an approver">
            <p className="m-0 text-sm text-muted">Charges the agent escalates wait for your signature.</p>
            <ButtonLink href="/approve" className="self-start">Open the approval queue</ButtonLink>
          </Card>
        )}
        <PayerEpisodes rows={payerEpisodes} />
        <Card title="Are you a clinic, hospital or facilitator?">
          <p className="m-0 max-w-[560px] text-sm leading-relaxed text-muted">
            Set up your provider profile to receive USDC per approved charge. We create a wallet for you; there&apos;s no seed phrase to keep.
          </p>
          <ProviderSetup />
        </Card>
      </>
    );
  }

  const data = await getDashboard(s);
  const open = data.episodes.filter((e) => OPEN.has(e.status));
  const heldTotal = sum(open.map(held));
  const paidTotal = sum(data.episodes.map((e) => e.paidTotal));
  const covererTotal = sum(open.map((e) => e.covererBalance));
  const familyTotal = sum(open.map((e) => e.familyBalance));
  const marginCall = data.marginCalls[0];

  return (
    <>
      <LiveRefresh channel="dashboard" tables={["episodes", "charges", "decisions"]} />
      <PageHeader
        title={`${greeting()}, ${s.provider.name}`}
        subtitle={open.length > 0 ? `${open.length} open ${open.length === 1 ? "episode" : "episodes"}. Every charge is reviewed by the agent within seconds.` : "Create an episode from a patient's quote to get started."}
        actions={
          <>
            <ButtonLink href="/provider/prices" variant="secondary">Price list</ButtonLink>
            <ButtonLink href="/provider/episodes/new">New episode</ButtonLink>
          </>
        }
      />

      <section aria-label="Totals" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="a-rise d1 lift flex flex-col justify-between gap-6 rounded-2xl border border-line bg-card p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="eyebrow">Held for treatment</span>
            <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-muted">{open.length} open</span>
          </div>
          <div className="flex flex-col gap-3">
            <Money value={heldTotal} display className="text-[32px] font-bold" />
            {heldTotal > 0n ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex h-2 gap-[3px] overflow-hidden rounded-full" role="img" aria-label={`Coverer ${share(covererTotal, heldTotal)}%, family ${share(familyTotal, heldTotal)}%`}>
                  <span className="a-grow bg-strong" style={{ flex: `${share(covererTotal, heldTotal)} 1 0` }} />
                  <span className="a-grow bg-accent [animation-delay:.2s]" style={{ flex: `${share(familyTotal, heldTotal)} 1 0` }} />
                </div>
                <span className="flex justify-between text-xs text-muted">
                  <span>Coverer <Money value={covererTotal} /></span>
                  <span>Family <Money value={familyTotal} /></span>
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted">Appears once payers fund an episode.</span>
            )}
          </div>
        </div>

        <div className="a-rise d2 lift flex flex-col justify-between gap-6 rounded-2xl bg-inv p-5 text-inv-ink">
          <span className="eyebrow !text-inv-muted">Paid to you</span>
          <div className="flex flex-col gap-2">
            <span className="amount font-display text-[32px] font-bold tracking-[-0.02em]">
              {formatAmount(paidTotal)}
              <span className="ccy !text-inv-muted">USDC</span>
            </span>
            <span className="text-xs text-inv-muted">Across all episodes. Each approved charge settles in seconds.</span>
          </div>
        </div>

        {marginCall ? (
          <Link href={`/provider/episodes/${marginCall.episodeId}`} className="a-rise d3 lift flex flex-col justify-between gap-6 rounded-2xl border border-amber/30 bg-amber-bg p-5 sm:col-span-2 xl:col-span-1">
            <span className="flex items-center justify-between gap-2">
              <span className="eyebrow !text-amber">⚠ Margin call</span>
              <span className="text-xs font-semibold text-amber">{marginCall.episodeLabel}</span>
            </span>
            <span className="flex flex-col gap-2">
              <strong className="font-display text-xl leading-snug font-semibold text-ink">
                {marginCall.payerRole === "family" ? "Family" : "Coverer"} share is short <Money value={marginCall.amount} />
              </strong>
              <span className="text-sm text-ink">Charges wait until the payer tops up. <span className="font-semibold text-strong">Open episode →</span></span>
            </span>
          </Link>
        ) : (
          <div className="a-rise d3 flex flex-col justify-between gap-6 rounded-2xl border border-line bg-surface p-5 sm:col-span-2 xl:col-span-1">
            <span className="eyebrow">Funds check</span>
            <span className="flex flex-col gap-2">
              <strong className="font-display text-xl leading-snug font-semibold">✓ No margin calls</strong>
              <span className="text-sm text-muted">Every open episode has enough funds for its expected cost.</span>
            </span>
          </div>
        )}
      </section>

      <EpisodesTable episodes={data.episodes} />

      <Card title="Agent decisions" aside={<span className="text-xs text-muted">Latest {data.decisions.length}</span>}>
        {data.decisions.length === 0 ? (
          <p className="m-0 text-sm leading-relaxed text-muted">Every decision the agent makes (sizing, paying, escalating, discharging) appears here with its reason and a link to Arc.</p>
        ) : (
          <ol className="m-0 flex list-none flex-col divide-y divide-line p-0">
            {data.decisions.map((d) => {
              const ep = data.episodes.find((e) => e.id === d.episodeId);
              return (
                <li key={d.id} className="flex items-start gap-4 py-3 text-sm first:pt-0 last:pb-0">
                  <time className="w-11 flex-none pt-px text-xs font-semibold text-muted tabular-nums" dateTime={d.createdAt}>
                    {new Date(d.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </time>
                  <Link href={`/provider/episodes/${d.episodeId}`} className="hover-link min-w-0 flex-1">
                    {ep && <span className="mr-2 text-xs font-semibold text-muted">#{ep.contractEpisodeId?.toString()} {ep.patientLabel}</span>}
                    {d.reason}
                  </Link>
                  <span className="hidden flex-none sm:block"><TxLink hash={d.txHash} label="Arc" /></span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {payerEpisodes.length > 0 && <PayerEpisodes rows={payerEpisodes} />}
    </>
  );
}

function PayerEpisodes({ rows }: { rows: Awaited<ReturnType<typeof getPayerEpisodes>> }) {
  return (
    <Card title="Treatments you're paying for">
      {rows.length === 0 ? (
        <EmptyState title="Nothing to fund yet">
          When a clinic adds you as a payer, the treatment appears here with the amount to fund. Sign in with the email address the clinic used.
        </EmptyState>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((r) => {
            const left = toUnits(r.owed_usdc) - toUnits(r.funded_usdc);
            return (
              <li key={r.episodes.id}>
                <Link href={`/pay/${r.episodes.id}`} className="lift flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-4">
                  <span className="flex flex-col gap-0.5">
                    <strong className="text-sm">{r.episodes.providers.name} · for {r.episodes.patient_label}</strong>
                    <span className="text-xs text-muted">You pay {r.role === "coverer" ? "covered items" : "everything not covered"}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    {left > 0n && <span className="text-sm">To fund <Money value={left} className="font-semibold" /></span>}
                    <StatusPill status={r.episodes.status} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
