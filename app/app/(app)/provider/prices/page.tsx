import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db, type PriceItemRow } from "@/lib/server/db";
import { requireSession } from "@/lib/server/session";
import { PriceListEditor } from "./PriceListEditor";

export const metadata: Metadata = { title: "Price list · CareGuard" };

export default async function Prices() {
  const s = await requireSession("/provider/prices");
  if (!s.provider) redirect("/dashboard");
  const { data } = await db().from("price_items").select("*").eq("provider_id", s.provider.id).eq("active", true).order("code");
  const items = ((data ?? []) as PriceItemRow[]).map((i) => ({ id: i.id, code: i.code, label: i.label, unitPrice: String(i.unit_price_usdc) }));

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 font-display text-[28px] font-bold tracking-[-0.02em]">Price list</h1>
        <p className="m-0 max-w-[620px] text-sm leading-relaxed text-muted">
          Your own prices, one line per item. The agent pays a charge straight away only when it matches a line here and the quote; anything else
          goes to a human approver.
        </p>
      </div>
      <PriceListEditor initial={items} />
    </>
  );
}
