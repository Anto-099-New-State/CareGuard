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
  const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "A transaction hash is 0x followed by 64 characters.");
  const units = z.union([z.string().regex(/^\d+$/), z.number().int()]).transform((v) => BigInt(v));
  const input = await body(
    req,
    z.object({
      txHash: hash,
      // Present when the payer converted another currency to USDC first (in their own wallet).
      fx: z.object({ currencyIn: z.literal("EURC"), amountIn: units, swapTxHash: hash, quotedOut: units, minOut: units, route: z.literal("appkit") }).optional(),
    }),
  );
  return ok(
    await recordFunding(
      caller,
      id,
      input.txHash as `0x${string}`,
      input.fx ? { ...input.fx, swapTxHash: input.fx.swapTxHash as `0x${string}` } : undefined,
    ),
  );
});
