import type { Metadata } from "next";
import { AppSidebar } from "@/components/AppSidebar";
import { EpisodesTable } from "@/components/EpisodesTable";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SearchIcon } from "@/components/icons";
import { txUrl } from "@/lib/config";
import { getDashboard } from "@/lib/data";
import { formatMoney } from "@/lib/money";
import type { EpisodeSummary } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard · CareGuard" };

// Live data and today's date: render per request.
export const dynamic = "force-dynamic";

const OPEN = new Set(["created", "funded", "active", "margin_call"]);

const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);
const held = (e: EpisodeSummary) => e.covererBalance + e.familyBalance;
const share = (part: bigint, total: bigint) => (total === 0n ? 0 : Number((part * 1000n) / total) / 10);

export default async function Dashboard() {
  const data = await getDashboard();
  const open = data.episodes.filter((e) => OPEN.has(e.status));
  const heldTotal = sum(open.map(held));
  const paidTotal = sum(data.episodes.map((e) => e.paidTotal));
  const covererTotal = sum(open.map((e) => e.covererBalance));
  const familyTotal = sum(open.map((e) => e.familyBalance));
  const marginCall = data.marginCalls[0];
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="flex min-h-screen flex-wrap">
      <AppSidebar current="/dashboard" />

      <main id="dash" className="box-border flex min-w-0 flex-[999_1_560px] flex-col gap-7 px-[clamp(16px,3vw,48px)] py-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-[22px]">
          <span className="text-sm font-semibold">Today: {today}</span>
          <div className="flex flex-wrap items-center gap-[18px] text-sm">
            <label className="flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-3.5">
              <SearchIcon className="text-muted" />
              <span className="sr-only">Search episodes</span>
              <input placeholder="Search episodes" className="w-40 border-0 bg-transparent text-[13px] text-ink outline-0" />
            </label>
            <ThemeToggle />
            <span className="h-6 w-px bg-line" />
            {data.providerName ? (
              <span className="flex items-center gap-2.5 font-semibold">
                <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-strong text-[13px] font-bold text-white">
                  {data.providerName.slice(0, 2).toUpperCase()}
                </span>
                Welcome back, {data.providerName}
              </span>
            ) : (
              <a href="#signin" className="hover-link font-semibold">Sign in</a>
            )}
          </div>
        </header>

        <section aria-labelledby="bal" className="flex flex-col gap-4">
          <h2 id="bal" className="m-0 font-display text-[22px] font-bold">Guarantees</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-[18px]">
            <div className="a-rise d1 lift box-border flex min-h-[200px] flex-col justify-between gap-2.5 rounded-[14px] border border-ink p-5">
              <div className="flex justify-between text-xs">
                <span>{open.length} open {open.length === 1 ? "episode" : "episodes"}</span>
                <span className="text-muted">Held in the contract</span>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[13px] text-muted">Funds held for treatment</span>
                <strong className="font-mono text-[26px] font-semibold tracking-[-0.02em]">{formatMoney(heldTotal)}</strong>
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
              <div className="a-rise d3 box-border flex min-h-[200px] flex-col justify-between gap-3.5 rounded-[14px] bg-amber-bg p-[22px] text-amber">
                <span className="self-start rounded-full border border-current px-2.5 py-[5px] text-xs font-bold">Margin call · {marginCall.episodeId}</span>
                <strong className="font-display text-[22px] leading-[1.2] font-semibold text-ink">
                  {marginCall.payerRole === "family" ? "Family" : "Coverer"} share is short {formatMoney(marginCall.amount)}.
                </strong>
                <span className="text-sm text-ink">{marginCall.reason}</span>
              </div>
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
          <div className="flex flex-col gap-3.5 rounded-[14px] border border-line p-[22px]">
            <h2 className="m-0 text-base font-bold">Funding mix · open episodes</h2>
            {heldTotal === 0n ? (
              <p className="m-0 text-sm leading-relaxed text-muted">The split between coverer and family funds appears here once an episode is funded.</p>
            ) : (
              <>
                <div className="flex h-3 gap-[3px] overflow-hidden rounded-full">
                  <span className="a-grow bg-strong" style={{ flex: `${share(covererTotal, heldTotal)} 1 0` }} />
                  <span className="a-grow bg-accent [animation-delay:.25s]" style={{ flex: `${share(familyTotal, heldTotal)} 1 0` }} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-[13px]">
                  <div className="flex flex-col gap-1">
                    <span className="text-muted">Coverer · {share(covererTotal, heldTotal)}%</span>
                    <strong className="font-mono">{formatMoney(covererTotal)}</strong>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-muted">Family · {share(familyTotal, heldTotal)}%</span>
                    <strong className="font-mono">{formatMoney(familyTotal)}</strong>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col gap-2.5 rounded-[14px] border border-line p-[22px]">
            <h2 className="m-0 mb-1 text-base font-bold">Agent decisions</h2>
            {data.decisions.length === 0 ? (
              <p className="m-0 text-sm leading-relaxed text-muted">
                Every decision the agent makes (sizing, paying, escalating, discharging) appears here with its reason and a link to Arc.
              </p>
            ) : (
              data.decisions.slice(0, 5).map((d, i) => (
                <div key={d.id} className="a-in flex items-baseline gap-3 text-[13px]" style={{ animationDelay: `${0.3 + i * 0.15}s` }}>
                  <span className="w-14 flex-none font-mono text-muted">
                    {new Date(d.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="flex-auto">
                    <strong className="font-semibold">{d.outcome}</strong> <span className="text-muted">{d.reason}</span>
                  </span>
                  {d.txHash && (
                    <a href={txUrl(d.txHash)} target="_blank" rel="noreferrer" aria-label="View on Arc explorer" className="hover-link">↗</a>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
