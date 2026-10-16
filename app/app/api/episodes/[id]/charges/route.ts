import { z } from "zod";
import { requireCaller, requireProvider } from "@/lib/server/auth";
import { submitCharge } from "@/lib/server/episodes";
import { amount, body, handle, ok } from "@/lib/server/route";

type Ctx = { params: Promise<{ id: string }> };

/** The provider submits a charge; the agent pays, escalates or raises a margin call and says why. */
export const POST = handle(async (req, { params }: Ctx) => {
  const { id } = await params;
  const provider = await requireProvider(await requireCaller());
  const input = await body(
    req,
    z.object({
      priceItemId: z.string().uuid().nullable().default(null),
      description: z.string().default(""),
      quantity: z.number().int().positive().default(1),
      amount: amount.nullable().default(null),
    }),
  );
  return ok(await submitCharge(provider, id, input), 201);
});
