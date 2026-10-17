"use client";

import Link from "next/link";
import { useState } from "react";
import type { EpisodeStatus, EpisodeSummary } from "@/lib/types";
import { StatusPill } from "./StatusPill";
import { EmptyState } from "./ui/Bits";
import { ButtonLink } from "./ui/Button";
import { Money } from "./ui/Money";

const filters: { label: string; match: EpisodeStatus[] | null }[] = [
  { label: "All", match: null },
  { label: "Active", match: ["created", "funded", "active"] },
  { label: "Margin calls", match: ["margin_call"] },
  { label: "Closed", match: ["closed", "expired"] },
];

const th = "border-b border-line px-4 py-3 text-left text-xs font-semibold text-muted";
const td = "border-b border-line px-4 py-4 align-middle";

export function EpisodesTable({ episodes }: { episodes: EpisodeSummary[] }) {
  const [filter, setFilter] = useState("All");
  const match = filters.find((f) => f.label === filter)?.match;
  const rows = match ? episodes.filter((e) => match.includes(e.status)) : episodes;
  const count = (f: (typeof filters)[number]) => (f.match ? episodes.filter((e) => f.match!.includes(e.status)).length : episodes.length);

  return (
    <section aria-labelledby="eps" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="eps" className="m-0 font-display text-[22px] font-bold tracking-[-0.02em]">Care episodes</h2>
        {episodes.length > 0 && (
          <div role="group" aria-label="Filter by status" className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-surface p-1">
            {filters.map((f) => {
              const on = f.label === filter;
              return (
                <button
                  key={f.label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilter(f.label)}
                  className={`flex h-9 flex-none cursor-pointer items-center gap-1.5 rounded-full border-0 px-3.5 text-[13px] whitespace-nowrap ${on ? "bg-card font-bold text-ink shadow-[0_1px_2px_rgba(0,0,0,.12)]" : "bg-transparent font-semibold text-muted"}`}
                >
                  {f.label}
                  <span className={`rounded-full px-1.5 text-[11px] ${on ? "bg-chip" : ""}`}>{count(f)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {episodes.length === 0 ? (
        <EmptyState
          title="No care episodes yet"
          action={
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/provider/prices">Add your price list</ButtonLink>
              <ButtonLink href="/provider/episodes/new" variant="secondary">Create an episode</ButtonLink>
            </div>
          }
        >
          Each episode appears here with its status, payers, guarantee and what&apos;s been paid. Add your price list, then create an episode from a patient&apos;s quote.
        </EmptyState>
      ) : rows.length === 0 ? (
        <p className="m-0 rounded-2xl border border-dashed border-line p-6 text-sm text-muted">No episodes match “{filter}”.</p>
      ) : (
        <>
          {/* Desktop: table */}
          <div className="hidden overflow-hidden rounded-2xl border border-line bg-card md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={th}>Patient</th>
                  <th className={th}>Status</th>
                  <th className={th}>Payers</th>
                  <th className={`${th} text-right`}>Guarantee</th>
                  <th className={`${th} text-right`}>Paid</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="transition-colors last:[&>td]:border-b-0 hover:bg-surface">
                    <td className={td}>
                      <Link href={`/provider/episodes/${e.id}`} className="hover-link flex flex-col gap-0.5">
                        <span className="font-semibold">{e.patientLabel}</span>
                        <span className="text-xs text-muted">
                          #{e.contractEpisodeId?.toString() ?? "—"}{e.description ? ` · ${e.description}` : ""}
                        </span>
                      </Link>
                    </td>
                    <td className={td}><StatusPill status={e.status} /></td>
                    <td className={`${td} text-muted`}>
                      {e.payers.length === 0 ? "Not added yet" : e.payers.map((p) => (
                        <span key={p.role} className="mr-3 inline-flex items-center gap-1.5 whitespace-nowrap">
                          <span className={`h-1.5 w-1.5 rounded-full ${p.funded ? "bg-ok" : "bg-amber"}`} aria-hidden="true" />
                          {p.label}<span className="sr-only">{p.funded ? " (funded)" : " (not funded)"}</span>
                        </span>
                      ))}
                    </td>
                    <td className={`${td} text-right`}><Money value={e.guarantee} /></td>
                    <td className={`${td} text-right font-semibold`}><Money value={e.paidTotal} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone: cards */}
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0 md:hidden">
            {rows.map((e) => (
              <li key={e.id}>
                <Link href={`/provider/episodes/${e.id}`} className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
                  <span className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <strong className="truncate">{e.patientLabel}</strong>
                      <span className="truncate text-xs text-muted">#{e.contractEpisodeId?.toString() ?? "—"}{e.description ? ` · ${e.description}` : ""}</span>
                    </span>
                    <StatusPill status={e.status} />
                  </span>
                  <span className="grid grid-cols-2 gap-3 text-sm">
                    <span className="flex flex-col gap-0.5"><span className="text-xs text-muted">Guarantee</span><Money value={e.guarantee} /></span>
                    <span className="flex flex-col gap-0.5"><span className="text-xs text-muted">Paid</span><Money value={e.paidTotal} className="font-semibold" /></span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
