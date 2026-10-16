import { z } from "zod";
import { requireCaller, requireProvider } from "@/lib/server/auth";
import { db, must } from "@/lib/server/db";
import { savePriceList } from "@/lib/server/episodes";
import { amount, body, handle, ok } from "@/lib/server/route";

export const GET = handle(async () => {
  const provider = await requireProvider(await requireCaller());
  return ok(must(await db().from("price_items").select("*").eq("provider_id", provider.id).eq("active", true).order("code")));
});

/** Saves price items, matched by code: an existing code is updated, a new one added. */
export const POST = handle(async (req) => {
  const provider = await requireProvider(await requireCaller());
  const { items } = await body(
    req,
    z.object({ items: z.array(z.object({ code: z.string().min(1), label: z.string().min(1), unitPrice: amount })).min(1) }),
  );
  return ok(await savePriceList(provider, items), 201);
});
