import Link from "next/link";
import { CountUp } from "@/components/CountUp";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowDownIcon, ArrowUpRightIcon, ClockBackIcon, HospitalIcon, LockIcon, SwapIcon } from "@/components/icons";

const steps = [
  { title: "Sizing", body: "Agent models the cost range and sets the guarantee at P90, priced in USD." },
  { title: "Funding", body: "Insurer, guarantor pool and family fund their shares in local stablecoins." },
  { title: "Admission", body: "Hospital sees committed funds and admits the patient. No GOP letter wait." },
  { title: "Treatment", body: "Each signed charge is checked against coverage and paid instantly." },
  { title: "Risk control", body: "On an overrun the agent issues a margin call; the pool covers defaults." },
  { title: "Discharge", body: "Account reconciles and excess is refunded to each payer in seconds." },
  { title: "Decision ledger", body: "Every action is recorded onchain with its reason." },
];

const feed = [
  { label: "MRI scan", payer: "Insurer", amount: "$640.00", status: "paid · 0.4s", done: true },
  { label: "Private room upgrade", payer: "Family", amount: "$210.00", status: "paid · 0.5s", done: true },
  { label: "Physiotherapy x3", payer: "Insurer", amount: "$390.00", status: "checking", done: false },
];

const ledger = [
  { when: "09:14", what: "Guarantee sized at P90 from package and history", amount: "$18,400" },
  { when: "Day 3", what: "Overrun forecast; margin call to family share", amount: "$1,240" },
  { when: "Day 9", what: "Discharged; excess refunded to 3 payers", amount: "$2,115" },
];

const tokensIn = ["JPYC", "EURC", "CADD", "GBPA", "AUDD"];
const tokensOut = ["KRW1", "MXNB", "TRYB"];

const h2 = "m-0 font-display font-extrabold tracking-[-0.03em]";
const cardTitle = "m-0 font-display text-[28px] font-bold tracking-[-0.02em]";
const body = "m-0 text-[15px] leading-relaxed text-muted";
const pillBtn = "btn rounded-full bg-accent font-bold text-accent-ink";

function TokenCoin({ code }: { code: string }) {
  return (
    <span className="a-bob flex h-16 w-16 items-center justify-center rounded-full border border-line bg-chip text-[13px] font-bold">
      {code}
    </span>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <nav aria-label="Main" className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-8 gap-y-4 px-6 py-[18px]">
          <Logo />
          <div className="flex flex-auto flex-wrap gap-x-7 gap-y-2 text-sm font-medium">
            <a className="hover-link" href="#features">Features</a>
            <a className="hover-link" href="#flow">How it works</a>
            <a className="hover-link" href="#currencies">Currencies</a>
            <a className="hover-link" href="#hospitals">For hospitals</a>
            <a className="hover-link" href="#docs">Docs</a>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link className="hover-link text-sm font-semibold" href="/signin">Sign in</Link>
            <Link href="/dashboard" className={`${pillBtn} px-6 py-[13px] text-sm`}>Launch app</Link>
          </div>
        </nav>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-14 px-6 pt-[88px] pb-24">
          <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-7">
            <span className="a-rise d1 flex items-center gap-2 self-start rounded-full border border-line px-3.5 py-[7px] text-[13px] font-semibold text-muted">
              <span className="a-pulse h-2 w-2 rounded-full bg-ok" />
              Settles in USDC on Arc
            </span>
            <h1 className="a-rise d2 m-0 font-display text-[clamp(44px,6vw,76px)] leading-[1.02] font-extrabold tracking-[-0.035em]">
              Treatment first.
              <br />
              Payment guaranteed.
            </h1>
            <p className="a-rise d3 m-0 max-w-[540px] text-[17px] leading-relaxed text-muted">
              An AI treasury agent turns every medical trip abroad into a risk-priced guarantee. Insurers, family and a guarantor pool fund it in
              their own currencies, the hospital is paid per approved charge, and the excess is refunded the moment the patient is discharged.
            </p>
            <div className="a-rise d4 flex flex-wrap items-center gap-7">
              <Link href="/dashboard" className={`${pillBtn} px-[34px] py-[18px] text-[15px]`}>Open a care episode</Link>
              <a href="#flow" className="arrow hover-link flex items-center gap-2 text-base font-semibold">
                See how it works
                <ArrowUpRightIcon />
              </a>
            </div>
          </div>

          <div className="a-card mx-auto flex min-w-0 max-w-[460px] flex-[1_1_380px] flex-col gap-3.5 rounded-[20px] border border-line bg-card p-[22px] shadow-[0_30px_60px_-40px_rgba(20,16,60,.35)]">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-strong">
                <HospitalIcon size={22} stroke="#FFFFFF" />
              </span>
              <div className="flex flex-auto flex-col gap-0.5">
                <strong className="text-[15px]">[Hospital name], Seoul</strong>
                <span className="text-xs text-muted">Episode CG-2041 · Knee replacement</span>
              </div>
              <span className="rounded-full bg-ok-bg px-2.5 py-[5px] text-xs font-bold text-ok">Admitted</span>
            </div>
            <div className="flex flex-col gap-2.5 rounded-[14px] bg-surface p-[18px]">
              <span className="text-xs text-muted">Guarantee (P90 estimate)</span>
              <strong className="font-display text-[34px] tracking-[-0.02em] tabular-nums">
                <CountUp to={18400} prefix="$" suffix=".00" />
              </strong>
              <div className="flex h-2 gap-[3px] overflow-hidden rounded-full">
                <span className="a-grow flex-[50_1_0] bg-strong [animation-delay:.9s]" />
                <span className="a-grow flex-[30_1_0] bg-accent [animation-delay:1.15s]" />
                <span className="a-grow flex-[20_1_0] bg-muted [animation-delay:1.4s]" />
              </div>
              <div className="flex flex-wrap justify-between gap-1.5 text-xs text-muted">
                <span>Insurer 50%</span>
                <span>Guarantor pool 30%</span>
                <span>Family 20%</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5 rounded-[14px] bg-surface p-3.5">
                <span className="text-xs text-muted">Family funds in</span>
                <strong className="text-sm">JPYC · EURC · CADD</strong>
                <span className="text-[11px] text-muted">Held as USDC</span>
              </div>
              <div className="flex flex-col gap-1.5 rounded-[14px] bg-surface p-3.5">
                <span className="text-xs text-muted">Hospital paid in</span>
                <strong className="text-sm">KRW1</strong>
                <span className="text-[11px] text-muted">Per approved charge</span>
              </div>
            </div>
            <button type="button" className={`${pillBtn} a-glow cursor-pointer border-0 p-4 text-[15px]`}>Fund my share</button>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto grid max-w-[1240px] grid-cols-[repeat(auto-fit,minmax(min(100%,520px),1fr))] gap-6 px-6 pt-6 pb-24">
          <article className="lift reveal flex flex-col gap-[18px] rounded-[18px] border border-line p-7">
            <h2 className={cardTitle}>Multi-payer funding</h2>
            <p className={body}>Each payer funds their share in their own stablecoin. Everything converts to USDC through StableFX and sits in one guarantee.</p>
            <div className="flex flex-col gap-3 rounded-[14px] bg-surface p-[22px]">
              <label className="text-[13px] font-semibold" htmlFor="payer">Payer</label>
              <input id="payer" defaultValue="Hiroshi (son) · Osaka" className="rounded-[10px] border border-line bg-card px-3.5 py-3 text-sm text-ink" />
              <span className="text-[13px] font-semibold">Pay with</span>
              <div className="grid grid-cols-4 gap-2.5">
                {["JPYC", "USDC", "EURC"].map((c, i) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={i === 0}
                    className={`cursor-pointer rounded-xl bg-card px-2 py-3 text-[13px] text-ink ${i === 0 ? "border-2 border-strong font-bold" : "border border-line font-semibold"}`}
                  >
                    {c}
                  </button>
                ))}
                <button type="button" aria-label="More currencies" className="cursor-pointer rounded-xl border border-line bg-card px-2 py-3 text-[13px] font-bold text-ink">•••</button>
              </div>
            </div>
          </article>

          <article className="lift reveal flex flex-col gap-[18px] rounded-[18px] border border-line p-7">
            <div className="flex flex-col gap-2.5 rounded-[14px] bg-surface p-[18px]">
              <div className="flex justify-between text-xs text-muted">
                <span>Live charges · CG-2041</span>
                <span>signed by hospital</span>
              </div>
              {feed.map((f, i) => (
                <div key={f.label} className="a-feed flex items-center justify-between gap-2.5 rounded-[10px] bg-card px-3.5 py-3 text-sm" style={{ animationDelay: `${i * 0.7}s` }}>
                  <span>{f.label}</span>
                  <span className="text-xs text-muted">{f.payer}</span>
                  <strong>{f.amount}</strong>
                  <span className={`rounded-full px-[9px] py-1 text-[11px] font-bold ${f.done ? "bg-ok-bg text-ok" : "a-blink bg-info-bg text-info"}`}>{f.status}</span>
                </div>
              ))}
            </div>
            <h2 className={cardTitle}>Per-charge settlement</h2>
            <p className={body}>The hospital signs each charge, the contract checks it against coverage and routes it to the right payer. About $0.01 a charge, final in under a second.</p>
          </article>

          <article className="lift reveal flex flex-col gap-[18px] rounded-[18px] border border-line p-7">
            <div className="flex flex-col gap-3.5 rounded-[14px] bg-surface p-[22px]">
              <div className="flex justify-between text-[13px]">
                <span className="text-muted">Cost range for package</span>
                <strong>P50 $14.9k · P90 $18.4k</strong>
              </div>
              <svg viewBox="0 0 400 110" width="100%" height="110" role="img" aria-label="Cost distribution curve with the guarantee set at the 90th percentile">
                <path className="a-draw" d="M0 105 C80 105 110 20 170 14 C230 8 260 70 320 92 C350 100 380 104 400 105" fill="none" stroke="var(--strong)" strokeWidth="2.5" />
                <path className="a-fill" d="M0 105 C80 105 110 20 170 14 C230 8 260 70 320 92 L320 105 Z" fill="var(--accent)" opacity="0.25" />
                <line x1="320" y1="0" x2="320" y2="108" stroke="var(--ink)" strokeDasharray="4 4" />
                <text x="314" y="14" textAnchor="end" fontSize="12" fill="var(--ink)">P90 guarantee</text>
              </svg>
              <div className="flex justify-between text-[13px]">
                <span className="text-muted">Pool fee (agent-priced)</span>
                <strong>1.8% of pool share</strong>
              </div>
            </div>
            <h2 className={cardTitle}>Risk-priced guarantees</h2>
            <p className={body}>The agent sizes the guarantee at a high-confidence estimate instead of the hospital quote, and prices the guarantor pool&apos;s backing per case, not all-or-nothing.</p>
          </article>

          <article className="lift reveal flex flex-col gap-[18px] rounded-[18px] border border-line p-7">
            <h2 className={cardTitle}>Decision ledger</h2>
            <p className={body}>Every sizing, fee, margin call, release and refund is written onchain with its reason, so insurers and auditors can replay the whole episode.</p>
            <div className="overflow-hidden rounded-[14px] border border-line text-[13px]">
              {ledger.map((l, i) => (
                <div key={l.when} className={`grid grid-cols-[90px_minmax(0,1fr)_auto] gap-3 px-4 py-[13px] ${i < ledger.length - 1 ? "border-b border-line" : ""}`}>
                  <span className="text-muted">{l.when}</span>
                  <span>{l.what}</span>
                  <strong>{l.amount}</strong>
                </div>
              ))}
            </div>
          </article>
        </section>

        {/* Currencies */}
        <section id="currencies" className="border-y border-line bg-surface">
          <div className="mx-auto flex max-w-[1240px] flex-col gap-12 px-6 py-24">
            <div className="flex flex-wrap items-center gap-12">
              <div className="reveal flex min-w-0 flex-[1_1_440px] flex-col gap-[22px]">
                <span className="text-sm font-semibold text-muted">Global payments</span>
                <h2 className={`${h2} text-[clamp(36px,4.5vw,54px)] leading-[1.05]`}>
                  17 currencies in.
                  <br />
                  One USDC balance.
                </h2>
                <p className="m-0 max-w-[480px] text-base leading-relaxed text-muted">
                  Families pay from Tokyo, Toronto or Frankfurt. The hospital gets paid in its own currency. Nobody holds a weak local currency through a long stay.
                </p>
                <a href="#docs" className={`${pillBtn} self-start px-[30px] py-[15px] text-sm`}>View supported tokens</a>
              </div>
              <div className="flex min-w-0 flex-[1_1_440px] flex-col items-center gap-[18px] rounded-[20px] border border-line bg-card p-9">
                <div className="flex flex-wrap justify-center gap-3">{tokensIn.map((c) => <TokenCoin key={c} code={c} />)}</div>
                <ArrowDownIcon className="a-drop text-muted" />
                <span className="a-glow rounded-full bg-strong px-[34px] py-[18px] font-display text-[22px] font-bold text-white">USDC on Arc</span>
                <ArrowDownIcon className="a-drop text-muted" />
                <div className="flex flex-wrap justify-center gap-3">{tokensOut.map((c) => <TokenCoin key={c} code={c} />)}</div>
              </div>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-5">
              {[
                { icon: <SwapIcon size={20} />, title: "Convert automatically", text: "StableFX converts in and out at settlement time; the agent times conversions to cut leakage." },
                { icon: <ClockBackIcon size={20} />, title: "Refunds in seconds", text: "At discharge the account reconciles and each payer gets their excess back in their own currency." },
                { icon: <LockIcon size={20} />, title: "Agent with hard limits", text: "The contract enforces remaining guarantee ≤ collateral. The agent can't overspend or pay anyone unapproved." },
              ].map((c) => (
                <div key={c.title} className="lift reveal flex flex-col gap-3.5 rounded-2xl border border-line bg-card p-[26px]">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-chip">{c.icon}</span>
                  <h3 className="m-0 text-xl font-bold">{c.title}</h3>
                  <p className="m-0 text-sm leading-[1.55] text-muted">{c.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Flow */}
        <section id="flow" className="mx-auto flex max-w-[1240px] flex-col gap-10 px-6 py-24">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <h2 className={`${h2} text-[clamp(34px,4vw,48px)]`}>One episode, seven steps</h2>
            <p className="m-0 max-w-[420px] leading-relaxed text-muted">From quote to refund, every step is enforced by the contract and explained in the ledger.</p>
          </div>
          <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-4 p-0">
            {steps.map((s, i) => (
              <li key={s.title} className="lift reveal flex flex-col gap-2.5 rounded-2xl border border-line p-[22px]">
                <span className="font-display text-sm font-bold text-strong">0{i + 1}</span>
                <strong className="text-lg">{s.title}</strong>
                <span className="text-sm leading-[1.55] text-muted">{s.body}</span>
              </li>
            ))}
            <li className="flex flex-col justify-between gap-[18px] rounded-2xl bg-inv p-[22px] text-inv-ink">
              <strong className="font-display text-2xl leading-[1.15]">Ready to guarantee your first episode?</strong>
              <Link href="/dashboard" className={`${pillBtn} self-start px-6 py-[13px] text-sm`}>Launch app</Link>
            </li>
          </ol>
        </section>

        {/* For hospitals */}
        <section id="hospitals" className="mx-auto max-w-[1240px] px-6 pb-24">
          <div className="reveal flex flex-wrap items-center justify-between gap-8 rounded-3xl bg-strong px-12 py-14 text-white max-sm:px-6">
            <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-3.5">
              <h2 className={`${h2} text-[clamp(30px,3.6vw,44px)] leading-[1.08]`}>Infrastructure for medical-travel platforms</h2>
              <p className="m-0 max-w-[560px] text-base leading-relaxed text-[#E7E3FF]">
                Plug CareGuard&apos;s guarantee engine into your existing hospital and insurer relationships. You own the patient; we underwrite the episode.
              </p>
            </div>
            <div className="flex flex-wrap gap-3.5">
              <a href="#docs" className="rounded-full bg-white px-7 py-4 text-sm font-bold text-[#1A1340]">Read the docs</a>
              <a href="#sales" className="rounded-full border border-white px-7 py-4 text-sm font-bold text-white">Talk to us</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-wrap justify-between gap-4 px-6 py-8 text-[13px] text-muted">
          <span>CareGuard · built on Arc · hackathon prototype</span>
          <span>Test tokens stand in for regulated stablecoins</span>
        </div>
      </footer>
    </div>
  );
}
