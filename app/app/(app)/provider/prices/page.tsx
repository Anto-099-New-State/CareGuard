import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db, type PriceItemRow } from "@/lib/server/db";
import { PageHeader } from "@/components/ui/PageHeader";
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
      <PageHeader
        title="Price list"
        subtitle="Your own prices, one line per item. The agent pays a charge straight away only when it matches a line here and the quote; anything else goes to a human approver."
      />
      <PriceListEditor initial={items} />
    </>
  );
}
