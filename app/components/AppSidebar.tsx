"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { addressUrl, config } from "@/lib/config";
import { Logo } from "./Logo";
import { ApprovalsIcon, DashboardIcon, EpisodesIcon, LedgerIcon, PriceListIcon } from "./icons";

type Item = { href: string; label: string; icon: ReactNode };

const short = (a: string) => `${a.slice(0, 5)}…${a.slice(-4)}`;

export function AppSidebar({ provider, approver }: { provider: boolean; approver: boolean }) {
  const path = usePathname();
  const groups: { title: string; items: Item[] }[] = [
    { title: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: <DashboardIcon /> }] },
  ];
  if (provider) {
    groups.push({
      title: "Provider",
      items: [
        { href: "/provider/episodes/new", label: "New episode", icon: <EpisodesIcon /> },
        { href: "/provider/prices", label: "Price list", icon: <PriceListIcon /> },
      ],
    });
  }
  if (approver) {
    groups.push({
      title: "Team",
      items: [
        { href: "/approve", label: "Approvals", icon: <ApprovalsIcon /> },
        { href: "/team/traction", label: "Traction", icon: <LedgerIcon /> },
      ],
    });
  }
  const agent = process.env.NEXT_PUBLIC_AGENT_ADDRESS;

  return (
    <aside className="box-border flex max-w-full flex-[1_1_240px] flex-col gap-7 border-r border-line bg-side px-[22px] py-8 max-md:border-r-0 max-md:border-b">
      <Logo size="md" dot={false} />
      <nav aria-label="App" className="flex flex-col gap-[22px] text-sm max-md:flex-row max-md:flex-wrap max-md:gap-3">
        {groups.map((g) => (
          <div key={g.title} className="flex flex-col gap-1 max-md:flex-row max-md:flex-wrap">
            <span className="px-2.5 pb-1.5 text-xs text-muted max-md:sr-only">{g.title}</span>
            {g.items.map((item) => {
              const on = path === item.href || (item.href !== "/dashboard" && path.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  className={`navlink flex min-h-11 items-center gap-3 rounded-[10px] p-2.5 ${on ? "bg-chip font-bold text-strong" : ""}`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-2 rounded-[14px] border border-line p-3.5 text-xs max-md:hidden">
        <span className="flex items-center gap-2 font-bold">
          <span className="a-pulse h-2 w-2 rounded-full bg-ok" />
          Arc {config.network}
        </span>
        {agent ? (
          <a href={addressUrl(agent) || undefined} target="_blank" rel="noreferrer" className="hover-link font-mono text-muted">
            Agent wallet {short(agent)} ↗
          </a>
        ) : (
          <span className="text-muted">Agent wallet not configured</span>
        )}
      </div>
    </aside>
  );
}
