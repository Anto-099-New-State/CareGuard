"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { addressUrl, config } from "@/lib/config";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { ApprovalsIcon, DashboardIcon, EpisodesIcon, LedgerIcon, PriceListIcon } from "./icons";

type Item = { href: string; label: string; icon: ReactNode };
export type ShellUser = { name: string; email: string | null; initials: string } | null;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function groupsFor(provider: boolean, approver: boolean) {
  const groups: { title: string; items: Item[] }[] = [{ title: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: <DashboardIcon /> }] }];
  if (provider)
    groups.push({
      title: "Provider",
      items: [
        { href: "/provider/episodes/new", label: "New episode", icon: <EpisodesIcon /> },
        { href: "/provider/prices", label: "Price list", icon: <PriceListIcon /> },
      ],
    });
  if (approver)
    groups.push({
      title: "Team",
      items: [
        { href: "/approve", label: "Approvals", icon: <ApprovalsIcon /> },
        { href: "/team/traction", label: "Traction", icon: <LedgerIcon /> },
      ],
    });
  return groups;
}

function Nav({ provider, approver, onNavigate }: { provider: boolean; approver: boolean; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="App" className="flex flex-col gap-6 text-sm">
      {groupsFor(provider, approver).map((g) => (
        <div key={g.title} className="flex flex-col gap-1">
          <span className="eyebrow px-3 pb-1.5 text-[11px]">{g.title}</span>
          {g.items.map((item) => {
            const on = path === item.href || (item.href !== "/dashboard" && path.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={on ? "page" : undefined}
                className={`navlink flex min-h-11 items-center gap-3 rounded-xl px-3 font-semibold ${on ? "bg-card text-strong shadow-[0_1px_0_var(--line),0_6px_18px_-12px_rgba(20,16,60,.35)]" : "text-ink"}`}
              >
                <span className={on ? "text-strong" : "text-muted"}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function NetworkCard({ agent }: { agent: string | null }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-line bg-card p-3.5 text-xs">
      <span className="flex items-center gap-2 font-bold capitalize">
        <span className="a-pulse h-2 w-2 rounded-full bg-ok" aria-hidden="true" />
        Arc {config.network}
      </span>
      {agent ? (
        addressUrl(agent) ? (
          <a href={addressUrl(agent)} target="_blank" rel="noreferrer" className="hover-link text-muted">
            Agent wallet <span className="font-mono">{short(agent)}</span> ↗
          </a>
        ) : (
          <span className="text-muted">Agent wallet <span className="font-mono">{short(agent)}</span></span>
        )
      ) : (
        <span className="text-muted">Agent wallet not configured</span>
      )}
    </div>
  );
}

function UserBlock({ user }: { user: ShellUser }) {
  if (!user)
    return (
      <Link href="/signin" className="hover-link text-sm font-semibold">
        Sign in
      </Link>
    );
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-strong text-[13px] font-bold text-white">
        {user.initials}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold">{user.name}</span>
        <form action="/auth/signout" method="post">
          <button type="submit" className="hover-link cursor-pointer border-0 bg-transparent p-0 text-xs font-semibold text-muted">
            Sign out
          </button>
        </form>
      </span>
    </div>
  );
}

/** Desktop sidebar; on phones a sticky top bar with a menu that opens the same navigation. */
export function AppSidebar({ provider, approver, agent, user }: { provider: boolean; approver: boolean; agent: string | null; user: ShellUser }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[264px] flex-none flex-col gap-8 overflow-y-auto border-r border-line bg-side px-5 py-7 md:flex">
        <Logo size="md" dot={false} href="/dashboard" />
        <Nav provider={provider} approver={approver} />
        <div className="mt-auto flex flex-col gap-4">
          <NetworkCard agent={agent} />
          <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
            <UserBlock user={user} />
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex w-full items-center justify-between gap-3 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur md:hidden">
        <Logo size="md" dot={false} href="/dashboard" />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-ink"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
        {open && (
          <div id="mobile-nav" className="absolute inset-x-0 top-full flex flex-col gap-6 border-b border-line bg-side px-4 pt-5 pb-6 shadow-[0_24px_40px_-24px_rgba(20,16,60,.45)]">
            <Nav provider={provider} approver={approver} onNavigate={() => setOpen(false)} />
            <NetworkCard agent={agent} />
            <UserBlock user={user} />
          </div>
        )}
      </header>
    </>
  );
}
