import { z } from "zod";
import { requireCaller } from "@/lib/server/auth";
import { recordFunding } from "@/lib/server/episodes";
import { body, handle, ok } from "@/lib/server/route";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The payer funds from their own wallet (approve + fund) and reports the transaction here.
 * The server checks the receipt onchain before recording anything.
 */
export const POST = handle(async (req, { params }: Ctx) => {
  const { id } = await params;
  const caller = await requireCaller();
  const { txHash } = await body(req, z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "A transaction hash is 0x followed by 64 characters.") }));
  return ok(await recordFunding(caller, id, txHash as `0x${string}`));
});
