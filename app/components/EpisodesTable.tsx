"use client";

import Link from "next/link";
import { useState } from "react";
import { formatMoney } from "@/lib/money";
import type { EpisodeStatus, EpisodeSummary } from "@/lib/types";
import { StatusPill } from "./StatusPill";

const filters: { label: string; match: EpisodeStatus[] | null }[] = [
  { label: "All", match: null },
  { label: "Active", match: ["funded", "active"] },
  { label: "Margin calls", match: ["margin_call"] },
  { label: "Closed", match: ["closed", "expired"] },
];

const th = "border-b border-line px-2.5 py-3.5 font-medium";
const td = "border-b border-line px-2.5 py-[18px]";

export function EpisodesTable({ episodes }: { episodes: EpisodeSummary[] }) {
  const [filter, setFilter] = useState("All");
  const match = filters.find((f) => f.label === filter)?.match;
  const rows = match ? episodes.filter((e) => match.includes(e.status)) : episodes;

  return (
    <section aria-labelledby="eps" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3.5">
        <h2 id="eps" className="m-0 font-display text-[22px] font-bold">Care episodes</h2>
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Filter by status" className="flex gap-1 rounded-full bg-surface p-1">
            {filters.map((f) => {
              const on = f.label === filter;
              return (
                <button
                  key={f.label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilter(f.label)}
                  className={`btn h-9 cursor-pointer rounded-full border-0 px-3.5 text-[13px] ${on ? "bg-card font-bold text-ink shadow-[0_1px_2px_rgba(0,0,0,.12)]" : "bg-transparent font-semibold text-muted"}`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          <Link href="/provider/episodes/new" className="btn flex h-11 items-center rounded-[10px] border border-ink px-[18px] text-[13px] font-bold">
            New episode
          </Link>
        </div>
      </div>

      {episodes.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-[14px] border border-dashed border-line p-8">
          <strong className="text-base">No care episodes yet</strong>
          <p className="m-0 max-w-[520px] text-sm leading-relaxed text-muted">
            Each episode appears here with its status, payers, guarantee and what&apos;s been paid. Add your price list, then create an episode from a patient&apos;s quote.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/provider/prices" className="btn rounded-full bg-accent px-5 py-3 text-[13px] font-bold text-accent-ink">Add your price list</Link>
            <Link href="/provider/episodes/new" className="btn rounded-full border border-line px-5 py-3 text-[13px] font-bold">Create an episode</Link>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <p className="m-0 rounded-[14px] border border-dashed border-line p-6 text-sm text-muted">No episodes match “{filter}”.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-[13px] text-muted">
                <th className={th}>Patient</th>
                <th className={th}>Episode</th>
                <th className={th}>Status</th>
                <th className={th}>Payers</th>
                <th className={`${th} text-right`}>Guarantee</th>
                <th className={`${th} text-right`}>Paid</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => (
                <tr key={e.id} className="a-in transition-colors hover:bg-surface" style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
                  <td className={`${td} font-semibold`}>
                    <Link href={`/provider/episodes/${e.id}`} className="hover-link">{e.patientLabel}</Link>
                    <span className="block text-xs font-normal text-muted">{e.description}</span>
                  </td>
                  <td className={`${td} font-mono`}>#{e.contractEpisodeId?.toString() ?? "—"}</td>
                  <td className={td}><StatusPill status={e.status} /></td>
                  <td className={`${td} text-muted`}>{e.payers.map((p) => `${p.label}${p.funded ? "" : " (unfunded)"}`).join(", ")}</td>
                  <td className={`${td} text-right font-mono`}>{formatMoney(e.guarantee)}</td>
                  <td className={`${td} text-right font-mono font-semibold`}>{formatMoney(e.paidTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
