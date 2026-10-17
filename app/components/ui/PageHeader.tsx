import Link from "next/link";
import type { ReactNode } from "react";

/** Title, one line of context, and the page's main actions. Every app page starts with one. */
export function PageHeader({ title, subtitle, back, actions, meta }: { title: ReactNode; subtitle?: ReactNode; back?: { href: string; label: string }; actions?: ReactNode; meta?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        {back && (
          <Link href={back.href} className="hover-link text-sm font-semibold text-muted">
            ← {back.label}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="m-0 font-display text-[clamp(26px,3vw,34px)] leading-tight font-bold tracking-[-0.025em]">{title}</h1>
          {meta}
        </div>
        {subtitle && <p className="m-0 max-w-[680px] text-base leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}
