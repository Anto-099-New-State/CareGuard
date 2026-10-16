import Link from "next/link";
import type { ReactNode } from "react";
import { addressUrl, config } from "@/lib/config";
import { Logo } from "./Logo";
import { ApprovalsIcon, DashboardIcon, EpisodesIcon, HelpIcon, LedgerIcon, PriceListIcon, ReceiptIcon, RefundIcon } from "./icons";

type Item = { href: string; label: string; icon: ReactNode };

const groups: { title: string; items: Item[] }[] = [
  {
    title: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: <DashboardIcon /> },
      { href: "/provider/episodes", label: "Care episodes", icon: <EpisodesIcon /> },
      { href: "/provider/prices", label: "Price list", icon: <PriceListIcon /> },
    ],
  },
  {
    title: "Money flow",
    items: [
      { href: "/provider/charges", label: "Charges", icon: <ReceiptIcon /> },
      { href: "/provider/refunds", label: "Refunds", icon: <RefundIcon /> },
    ],
  },
  {
    title: "Agent",
    items: [
      { href: "/approve", label: "Approvals", icon: <ApprovalsIcon /> },
      { href: "/episodes/log", label: "Decision log", icon: <LedgerIcon /> },
      { href: "/help", label: "Contact us", icon: <HelpIcon /> },
    ],
  },
];

const short = (a: string) => `${a.slice(0, 5)}…${a.slice(-4)}`;

export function AppSidebar({ current }: { current: string }) {
  const agent = process.env.NEXT_PUBLIC_AGENT_ADDRESS;
  return (
    <aside className="box-border flex max-w-full flex-[1_1_240px] flex-col gap-7 border-r border-line bg-side px-[22px] py-8">
      <Logo size="md" dot={false} />
      <nav aria-label="App" className="flex flex-col gap-[22px] text-sm">
        {groups.map((g) => (
          <div key={g.title} className="flex flex-col gap-1">
            <span className="px-2.5 pb-1.5 text-xs text-muted">{g.title}</span>
            {g.items.map((item) => {
              const on = item.href === current;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  className={`navlink flex items-center gap-3 rounded-[10px] p-2.5 ${on ? "bg-chip font-bold text-strong" : ""}`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-2 rounded-[14px] border border-line p-3.5 text-xs">
        <span className="flex items-center gap-2 font-bold">
          <span className="a-pulse h-2 w-2 rounded-full bg-ok" />
          Arc {config.network}
        </span>
        {agent ? (
          <a href={addressUrl(agent)} target="_blank" rel="noreferrer" className="hover-link font-mono text-muted">Agent wallet {short(agent)} ↗</a>
        ) : (
          <span className="text-muted">Agent wallet not configured</span>
        )}
      </div>
    </aside>
  );
}
