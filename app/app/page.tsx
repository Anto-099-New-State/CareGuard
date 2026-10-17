import Link from "next/link";
import { HeroArc } from "@/components/HeroArc";
import { Logo } from "@/components/Logo";
import { Reveal } from "@/components/Reveal";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowDownIcon, ArrowUpRightIcon, ClockBackIcon, LockIcon, SwapIcon } from "@/components/icons";
import { CURRENCIES } from "@/lib/currencies";

const steps = [
  { title: "Sizing", body: "The agent sizes the guarantee from the provider's own quote plus a stated contingency, and explains why." },
  { title: "Funding", body: "The coverer and the family each fund their share in their own currency. It's converted to USDC and the contract holds it." },
  { title: "Treatment", body: "The provider sees the money is committed and starts treating. No guarantee letter to wait for." },
  { title: "Per-charge review", body: "Each charge on the price list and under the cap is paid in seconds, split between the two payers." },
  { title: "Escalation", body: "Over the cap, off the price list or a possible duplicate: a human approver signs before anything moves." },
  { title: "Margin call", body: "If funds won't cover the rest of the quote, the payer who is short is asked to top up." },
  { title: "Discharge", body: "Treatment ends and everything left goes back to each payer at once." },
];

const feed = [
  { label: "Consultation", payer: "Family", amount: "80.00", status: "paid", done: true },
  { label: "Implant surgery", payer: "Split", amount: "300.00", status: "paid", done: true },
  { label: "Bone graft", payer: "—", amount: "520.00", status: "approver", done: false },
];

const ledger = [
  { when: "14:02", what: "Sized the guarantee: quote + 20% contingency", amount: "1,800.00" },
  { when: "14:40", what: "Paid #3 Implant surgery: on the price list", amount: "300.00" },
  { when: "15:05", what: "Escalated #4 Bone graft: above the per-charge cap", amount: "520.00" },
];

/** What the AI agent does, and the limit on each job. */
const agentJobs = [
  { n: "01", title: "Sizes the guarantee", body: "Reads the hospital's quote, adds a stated contingency and sets a per-charge cap.", limit: "Only from the quote; the reason is logged." },
  { n: "02", title: "Converts currencies", body: "Gets a live EURC price, checks what actually arrived against the guaranteed minimum, logs the rate.", limit: "Conversion runs in the payer's own wallet." },
  { n: "03", title: "Reviews every charge", body: "Price list, quote, duplicates and cap are checked by rules; an LLM judges the description. Any doubt goes to a human.", limit: "Over the cap needs the approver's signature." },
  { n: "04", title: "Calls for top-ups", body: "If what's left won't cover the rest of the quote, it asks the payer who is short to top up.", limit: "It can't move money while it waits." },
  { n: "05", title: "Refunds at discharge", body: "When treatment ends, everything left returns to each payer in the same transaction.", limit: "Funds only ever go to the hospital or back." },
];

const h2 = "m-0 font-display font-extrabold tracking-[-0.03em]";
const cardTitle = "m-0 font-display text-[28px] font-bold tracking-[-0.02em]";
const body = "m-0 text-base leading-relaxed text-muted";
const pillBtn = "btn rounded-full bg-accent font-bold text-accent-ink";
/** Launch app: connect wallet, choose a role the first time, then the dashboard. */
const LAUNCH = "/signin?next=/dashboard";

const Amount = ({ v, className = "" }: { v: string; className?: string }) => (
  <span className={`amount ${className}`}>
    {v}
    <span className="ccy">USDC</span>
  </span>
);

export default function Landing() {
  return (
    <div className="min-h-screen">
      <Reveal />
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
        <nav aria-label="Main" className="mx-auto flex max-w-[1240px] items-center gap-6 px-6 py-2.5">
          <Logo size="md" />
          <div className="flex flex-auto gap-6 text-sm font-medium max-md:hidden">
            <a className="hover-link" href="#flow">How it works</a>
            <a className="hover-link" href="#agent">The agent</a>
            <a className="hover-link" href="#money">Currencies</a>
            <a className="hover-link" href="#providers">For hospitals</a>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <Link href={LAUNCH} className={`${pillBtn} px-5 py-2.5 text-sm whitespace-nowrap`}>Launch app</Link>
          </div>
        </nav>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-14 px-6 pt-[88px] pb-24 max-sm:pt-12">
          <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-7">
            <span className="a-rise d1 flex items-center gap-2 self-start rounded-full border border-line px-3.5 py-[7px] text-sm font-semibold text-muted">
              <span className="a-pulse h-2 w-2 rounded-full bg-ok" />
              Settles in USDC on Arc
            </span>
            <h1 className="a-rise d2 m-0 font-display text-[clamp(44px,6vw,76px)] leading-[1.02] font-extrabold tracking-[-0.035em]">
              Treatment first.
              <br />
              Payment guaranteed.
            </h1>
            <p className="a-rise d3 m-0 max-w-[560px] text-lg leading-relaxed text-muted">
              Before treatment abroad, the people paying for it (an insurer or employer, and the family) commit their money in their own currency. The
              hospital sees it&apos;s there and starts treating. An AI agent pays each charge in seconds, and whatever is left goes back to each payer.
            </p>
            <div className="a-rise d4 flex flex-wrap items-center gap-7">
              <Link href={LAUNCH} className={`${pillBtn} px-[34px] py-[18px] text-base`}>Open a care episode</Link>
              <a href="#flow" className="arrow hover-link flex items-center gap-2 text-base font-semibold">
                See how it works
                <ArrowUpRightIcon />
              </a>
            </div>
          </div>

          <div className="a-rise d3 min-w-0 flex-[1_1_440px]">
            <HeroArc />
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto grid max-w-[1240px] grid-cols-[repeat(auto-fit,minmax(min(100%,520px),1fr))] gap-6 px-6 pt-6 pb-24">
          <article className="lift reveal flex flex-col gap-[18px] rounded-[18px] border border-line p-7">
            <h2 className={cardTitle}>Two payers, one episode</h2>
            <p className={body}>
              A coverer (insurer, employer, or a relative paying covered items) and the family each fund their own share, each in their own
              currency. It&apos;s converted to USDC when they fund; the contract only ever holds USDC.
            </p>
            <div className="flex flex-col gap-3 rounded-[14px] bg-surface p-[22px]">
              <span className="text-sm font-semibold">Payer</span>
              <span className="rounded-[10px] border border-line bg-card px-3.5 py-3 text-sm">Ana (daughter) · Lisbon</span>
              <span className="text-sm font-semibold">Pay with</span>
              <div className="grid grid-cols-2 gap-2.5">
                <span className="rounded-xl border-2 border-strong bg-card px-2 py-3 text-center text-sm font-bold">EURC</span>
                <span className="rounded-xl border border-line bg-card px-2 py-3 text-center text-sm font-semibold">USDC</span>
              </div>
            </div>
          </article>

          <article className="lift reveal flex flex-col gap-[18px] rounded-[18px] border border-line p-7">
            <div className="flex flex-col gap-2.5 rounded-[14px] bg-surface p-[18px]">
              <div className="flex justify-between text-xs text-muted">
                <span>Charges · example episode</span>
                <span>reviewed by the agent</span>
              </div>
              {feed.map((f, i) => (
                <div key={f.label} className="a-feed flex items-center justify-between gap-2.5 rounded-[10px] bg-card px-3.5 py-3 text-sm" style={{ animationDelay: `${i * 0.7}s` }}>
                  <span>{f.label}</span>
                  <span className="text-xs text-muted">{f.payer}</span>
                  <Amount v={f.amount} className="font-semibold" />
                  <span className={`rounded-full px-[9px] py-1 text-xs font-bold ${f.done ? "bg-ok-bg text-ok" : "a-blink bg-amber-bg text-amber"}`}>{f.status}</span>
                </div>
              ))}
            </div>
            <h2 className={cardTitle}>Paid per charge</h2>
            <p className={body}>
              The provider submits each charge. If it&apos;s on their price list, in the quote and under the cap, the agent pays it in seconds, the covered
              part from the coverer and the rest from the family.
            </p>
          </article>

          <article className="lift reveal flex flex-col gap-[18px] rounded-[18px] border border-line p-7">
            <div className="flex flex-col gap-3 rounded-[14px] bg-surface p-[22px] text-sm">
              <div className="flex justify-between"><span className="text-muted">Provider&apos;s quote</span><Amount v="1,500.00" /></div>
              <div className="flex justify-between"><span className="text-muted">+ 20% contingency</span><Amount v="300.00" /></div>
              <div className="flex justify-between border-t border-line pt-3 font-semibold"><span>Guarantee</span><Amount v="1,800.00" /></div>
              <div className="flex justify-between"><span className="text-muted">Per-charge cap</span><Amount v="450.00" /></div>
            </div>
            <h2 className={cardTitle}>Sized from the quote</h2>
            <p className={body}>
              With no cost history to lean on, the agent sizes the guarantee from the provider&apos;s own quote plus a stated contingency, and sets a
              per-charge cap. Anything above the cap needs a human&apos;s signature.
            </p>
          </article>

          <article className="lift reveal flex flex-col gap-[18px] rounded-[18px] border border-line p-7">
            <h2 className={cardTitle}>Every decision, explained</h2>
            <p className={body}>
              Each sizing, payment, escalation, margin call and refund is written down with a plain reason before money moves, and its hash is logged
              on Arc so nobody can change it afterwards.
            </p>
            <div className="overflow-hidden rounded-[14px] border border-line text-sm">
              {ledger.map((l, i) => (
                <div key={l.when} className={`grid grid-cols-[56px_minmax(0,1fr)_auto] gap-3 px-4 py-[13px] ${i < ledger.length - 1 ? "border-b border-line" : ""}`}>
                  <span className="text-muted tabular-nums">{l.when}</span>
                  <span>{l.what}</span>
                  <Amount v={l.amount} className="font-semibold" />
                </div>
              ))}
            </div>
          </article>
        </section>

        {/* Agent */}
        <section id="agent" className="mx-auto flex max-w-[1240px] flex-col gap-10 px-6 pb-24">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="flex flex-col gap-3">
              <span className="text-sm font-semibold text-muted">The AI agent</span>
              <h2 className={`${h2} text-[clamp(34px,4vw,48px)] leading-[1.05]`}>Five jobs, each with a hard limit</h2>
            </div>
            <p className="m-0 max-w-[440px] leading-relaxed text-muted">
              The agent does the routine work so the hospital is paid in seconds. The contract decides what it is allowed to do, and every decision is
              written to the log with a plain reason.
            </p>
          </div>
          <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-4 p-0">
            {agentJobs.map((j) => (
              <li key={j.n} className="lift reveal flex flex-col gap-2.5 rounded-2xl border border-line p-[22px]">
                <span className="font-display text-sm font-bold text-strong">{j.n}</span>
                <strong className="text-lg leading-snug">{j.title}</strong>
                <span className="text-sm leading-[1.55] text-muted">{j.body}</span>
                <span className="mt-auto flex items-start gap-2 border-t border-line pt-3 text-xs font-semibold">
                  <LockIcon size={14} />
                  {j.limit}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* Money */}
        <section id="money" className="border-y border-line bg-surface">
          <div className="mx-auto flex max-w-[1240px] flex-col gap-12 px-6 py-24">
            <div className="flex flex-wrap items-center gap-12">
              <div className="reveal flex min-w-0 flex-[1_1_420px] flex-col gap-[22px]">
                <span className="text-sm font-semibold text-muted">Currencies</span>
                <h2 className={`${h2} text-[clamp(36px,4.5vw,54px)] leading-[1.05]`}>
                  Pay in your currency.
                  <br />
                  The hospital gets USDC.
                </h2>
                <p className="m-0 max-w-[480px] text-base leading-relaxed text-muted">
                  Each payer picks what they pay with on the funding page. Anything that isn&apos;t USDC is converted in their own wallet, with a live
                  price and a guaranteed minimum, before it reaches the contract. Today that&apos;s USDC and EURC; the local-currency stablecoins
                  announced for Arc switch on here as they launch.
                </p>
                <Link href={LAUNCH} className={`${pillBtn} self-start px-[30px] py-[15px] text-sm`}>Open the app</Link>
              </div>
              <div className="reveal flex min-w-0 flex-[1_1_480px] flex-col gap-5 rounded-[20px] border border-line bg-card p-7">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2.5">
                  {CURRENCIES.map((c) => (
                    <div
                      key={c.code}
                      className={`flex flex-col gap-0.5 rounded-xl px-3 py-2.5 ${c.status === "live" ? "border-2 border-strong bg-strong/10" : "border border-dashed border-line"}`}
                    >
                      <span className="flex items-center justify-between gap-1">
                        <strong className="text-sm">{c.code}</strong>
                        <span className="font-display text-sm text-muted">{c.symbol}</span>
                      </span>
                      <span className="truncate text-xs text-muted">{c.name}</span>
                      <span className={`text-[11px] font-bold ${c.status === "live" ? "text-ok" : "text-muted"}`}>{c.status === "live" ? "● Live" : "Coming to Arc"}</span>
                    </div>
                  ))}
                </div>
                <ArrowDownIcon className="a-drop self-center text-muted" />
                <span className="a-glow self-center rounded-full bg-strong px-[30px] py-[15px] text-center font-display text-xl font-bold text-white">Held in USDC on Arc</span>
                <div className="flex flex-wrap justify-center gap-3 text-center text-sm font-bold">
                  <span className="rounded-full border border-line bg-chip px-4 py-2.5">Hospital, per charge</span>
                  <span className="rounded-full border border-line bg-chip px-4 py-2.5">Payers, what&apos;s left</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-5">
              {[
                { icon: <SwapIcon size={20} />, title: "Converted with a guarantee", text: "Circle App Kit quotes the swap; if the price moves below the guaranteed minimum it's cancelled and nothing is spent. The agent logs the rate it got." },
                { icon: <ClockBackIcon size={20} />, title: "Refunds without us", text: "Leftovers return at discharge. If the episode passes its expiry, any payer can trigger the refund straight from the contract." },
                { icon: <LockIcon size={20} />, title: "One currency in the contract", text: "Holding only USDC keeps the cap, the split between payers and every refund exact, whatever each payer started with." },
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
            <p className="m-0 max-w-[420px] leading-relaxed text-muted">From quote to refund, the contract enforces the rules and the decision log explains every step.</p>
          </div>
          <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-4 p-0">
            {steps.map((s, i) => (
              <li key={s.title} className="lift reveal flex flex-col gap-2.5 rounded-2xl border border-line p-[22px]">
                <span className="font-display text-sm font-bold text-strong">0{i + 1}</span>
                <strong className="text-lg">{s.title}</strong>
                <span className="text-sm leading-[1.55] text-muted">{s.body}</span>
              </li>
            ))}
            <li className="reveal flex flex-col justify-between gap-[18px] rounded-2xl bg-inv p-[22px] text-inv-ink">
              <strong className="font-display text-2xl leading-[1.15]">Ready to open your first episode?</strong>
              <Link href={LAUNCH} className={`${pillBtn} self-start px-6 py-[13px] text-sm`}>Launch app</Link>
            </li>
          </ol>
        </section>

        {/* For providers */}
        <section id="providers" className="mx-auto max-w-[1240px] px-6 pb-24">
          <div className="reveal flex flex-wrap items-center justify-between gap-8 rounded-3xl bg-strong px-12 py-14 text-white max-sm:px-6">
            <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-3.5">
              <h2 className={`${h2} text-[clamp(30px,3.6vw,44px)] leading-[1.08]`}>For clinics, hospitals and facilitators</h2>
              <p className="m-0 max-w-[560px] text-base leading-relaxed text-[#E7E3FF]">
                Enter your price list, create an episode from a patient&apos;s quote, and get paid in USDC for each charge as you go. No waiting on paper
                guarantee letters, no chasing wires.
              </p>
            </div>
            <div className="flex flex-wrap gap-3.5">
              <Link href={LAUNCH} className="rounded-full bg-white px-7 py-4 text-sm font-bold text-[#1A1340]">Get started</Link>
              <a href="#flow" className="rounded-full border border-white px-7 py-4 text-sm font-bold text-white">How it works</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-wrap justify-between gap-4 px-6 py-8 text-sm text-muted">
          <span>CareGuard · built on Arc · hackathon prototype</span>
          <span>Examples on this page are illustrations, not real patients.</span>
        </div>
      </footer>
    </div>
  );
}
