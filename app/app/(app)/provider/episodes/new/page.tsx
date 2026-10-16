import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Bits";
import { db, type PriceItemRow } from "@/lib/server/db";
import { settings } from "@/lib/server/env";
import { requireSession } from "@/lib/server/session";
import { NewEpisodeFlow } from "./NewEpisodeFlow";

export const metadata: Metadata = { title: "New episode · CareGuard" };

export default async function NewEpisode() {
  const s = await requireSession("/provider/episodes/new");
  if (!s.provider) redirect("/dashboard");
  const { data } = await db().from("price_items").select("*").eq("provider_id", s.provider.id).eq("active", true).order("code");
  const items = ((data ?? []) as PriceItemRow[]).map((i) => ({ id: i.id, code: i.code, label: i.label, unitPrice: String(i.unit_price_usdc) }));

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 font-display text-[28px] font-bold tracking-[-0.02em]">New care episode</h1>
        <p className="m-0 max-w-[640px] text-sm leading-relaxed text-muted">
          Enter the patient&apos;s quote from your price list. The agent sizes the guarantee and explains why; then add the two payers and the
          episode goes onchain.
        </p>
      </div>
      {items.length === 0 ? (
        <EmptyState title="Add your price list first" action={<ButtonLink href="/provider/prices">Go to price list</ButtonLink>}>
          A quote is built from your own price list lines, so the agent can check every charge against it.
        </EmptyState>
      ) : (
        <NewEpisodeFlow items={items} defaults={{ contingencyPct: settings.contingencyBps / 100, capPct: settings.capBps / 100 }} />
      )}
    </>
  );
}
