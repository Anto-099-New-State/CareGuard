import type { Metadata } from "next";
import Link from "next/link";
import { EpisodesTable } from "@/components/EpisodesTable";
import { LiveRefresh } from "@/components/LiveRefresh";
import { ProviderSetup } from "@/components/ProviderSetup";
import { StatusPill } from "@/components/StatusPill";
import { ButtonLink } from "@/components/ui/Button";
import { Card, EmptyState } from "@/components/ui/Bits";
import { Money } from "@/components/ui/Money";
import { TxLink } from "@/components/ui/Tx";
import { getDashboard, getPayerEpisodes } from "@/lib/data";
import { formatMoney } from "@/lib/money";
import { requireSession } from "@/lib/server/session";
import type { EpisodeSummary } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard · CareGuard" };

const OPEN = new Set(["created", "funded", "active", "margin_call"]);
const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);
const held = (e: EpisodeSummary) => e.covererBalance + e.familyBalance;
const share = (part: bigint, total: bigint) => (total === 0n ? 0 : Number((part * 1000n) / total) / 10);

export default async function Dashboard() {
  const s = await requireSession("/dashboard");
  const payerEpisodes = await getPayerEpisodes(s);

  if (!s.provider) {
    return (
      <>
        <h1 className="m-0 font-display text-[28px] font-bold tracking-[-0.02em]">Welcome to CareGuard</h1>
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
      <section aria-labelledby="bal" className="flex flex-col gap-4">
        <h1 id="bal" className="m-0 font-display text-[22px] font-bold">Guarantees</h1>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-[18px]">
          <div className="a-rise d1 lift box-border flex min-h-[200px] flex-col justify-between gap-2.5 rounded-[14px] border border-ink p-5">
            <div className="flex justify-between text-xs">
              <span>{open.length} open {open.length === 1 ? "episode" : "episodes"}</span>
              <span className="text-muted">Held in the contract</span>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] text-muted">Funds held for treatment</span>
              <strong className="font-mono text-[26px] font-semibold tracking-[-0.02em]"><Money value={heldTotal} /></strong>
              {open.length === 0 && <span className="text-xs text-muted">Appears once payers fund an episode.</span>}
            </div>
          </div>

          <div className="a-rise d2 lift relative box-border flex min-h-[200px] flex-col justify-between gap-2.5 overflow-hidden rounded-[14px] bg-inv p-5 text-inv-ink">
            <span className="text-xs">All episodes</span>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] text-inv-muted">Paid to you</span>
              <strong className="font-mono text-[26px] font-semibold tracking-[-0.02em]">{formatMoney(paidTotal)}</strong>
              <span className="text-xs text-inv-muted">Each approved charge is paid in seconds.</span>
            </div>
          </div>

          {marginCall ? (
            <Link href={`/provider/episodes/${marginCall.episodeId}`} className="a-rise d3 box-border flex min-h-[200px] flex-col justify-between gap-3.5 rounded-[14px] bg-amber-bg p-[22px] text-amber">
              <span className="self-start rounded-full border border-current px-2.5 py-[5px] text-xs font-bold">⚠ Margin call · {marginCall.episodeLabel}</span>
              <strong className="font-display text-[22px] leading-[1.2] font-semibold text-ink">
                {marginCall.payerRole === "family" ? "Family" : "Coverer"} share is short <Money value={marginCall.amount} />.
              </strong>
              <span className="text-sm text-ink">Charges wait until the payer tops up. Open the episode →</span>
            </Link>
          ) : (
            <div className="a-rise d3 box-border flex min-h-[200px] flex-col justify-between gap-3.5 rounded-[14px] border border-line bg-surface p-[22px]">
              <span className="self-start rounded-full bg-ok-bg px-2.5 py-[5px] text-xs font-bold text-ok">✓ No margin calls</span>
              <strong className="font-display text-[22px] leading-[1.2] font-semibold">Every open episode has enough funds for its expected cost.</strong>
              <span className="text-xs text-muted">If funds run short, the agent asks the payer to top up and shows it here.</span>
            </div>
          )}
        </div>
      </section>

      <EpisodesTable episodes={data.episodes} />

      <section className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] gap-[18px]">
        <Card title="Funding mix · open episodes">
          {heldTotal === 0n ? (
            <p className="m-0 text-sm leading-relaxed text-muted">The split between coverer and family funds appears here once an episode is funded.</p>
          ) : (
            <>
              <div className="flex h-3 gap-[3px] overflow-hidden rounded-full">
                <span className="a-grow bg-strong" style={{ flex: `${share(covererTotal, heldTotal)} 1 0` }} />
                <span className="a-grow bg-accent [animation-delay:.25s]" style={{ flex: `${share(familyTotal, heldTotal)} 1 0` }} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <div className="flex flex-col gap-1"><span className="text-muted">Coverer · {share(covererTotal, heldTotal)}%</span><strong><Money value={covererTotal} /></strong></div>
                <div className="flex flex-col gap-1"><span className="text-muted">Family · {share(familyTotal, heldTotal)}%</span><strong><Money value={familyTotal} /></strong></div>
              </div>
            </>
          )}
        </Card>

        <Card title="Agent decisions">
          {data.decisions.length === 0 ? (
            <p className="m-0 text-sm leading-relaxed text-muted">Every decision the agent makes (sizing, paying, escalating, discharging) appears here with its reason and a link to Arc.</p>
          ) : (
            <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
              {data.decisions.map((d, i) => (
                <li key={d.id} className="a-in flex items-baseline gap-3 text-[13px]" style={{ animationDelay: `${0.3 + i * 0.1}s` }}>
                  <time className="w-12 flex-none font-mono text-muted" dateTime={d.createdAt}>
                    {new Date(d.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </time>
                  <Link href={`/provider/episodes/${d.episodeId}`} className="hover-link flex-auto">{d.reason}</Link>
                  <TxLink hash={d.txHash} label="" />
                </li>
              ))}
            </ol>
          )}
        </Card>
      </section>

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
          {rows.map((r) => (
            <li key={r.episodes.id}>
              <Link href={`/pay/${r.episodes.id}`} className="lift flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-line p-4">
                <span className="flex flex-col gap-0.5">
                  <strong className="text-sm">{r.episodes.providers.name} · for {r.episodes.patient_label}</strong>
                  <span className="text-xs text-muted">You pay {r.role === "coverer" ? "covered items" : "everything not covered"}</span>
                </span>
                <span className="flex items-center gap-3">
                  <Money value={BigInt(String(r.owed_usdc)) - BigInt(String(r.funded_usdc)) > 0n ? BigInt(String(r.owed_usdc)) - BigInt(String(r.funded_usdc)) : 0n} className="text-sm" />
                  <StatusPill status={r.episodes.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
