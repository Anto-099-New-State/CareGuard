import { z } from "zod";
import { requireCaller } from "@/lib/server/auth";
import { fund } from "@/lib/server/episodes";
import { amount, body, currency, handle, ok } from "@/lib/server/route";

type Ctx = { params: Promise<{ id: string }> };

/** A payer funds their share. EURC is swapped to USDC first; the contract only holds USDC. */
export const POST = handle(async (req, { params }: Ctx) => {
  const { id } = await params;
  const caller = await requireCaller();
  const input = await body(req, z.object({ amount, currency: currency.default("USDC") }));
  return ok(await fund(caller, id, input));
});
