import { z } from "zod";
import { requireApprover, requireCaller } from "@/lib/server/auth";
import { approveCharge, rejectCharge } from "@/lib/server/episodes";
import { body, handle, ok } from "@/lib/server/route";

type Ctx = { params: Promise<{ chargeId: string }> };

const input = z.discriminatedUnion("verdict", [
  z.object({
    verdict: z.literal("approve"),
    // The signature is made in the approver's browser wallet; the key never reaches the server.
    signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
    deadline: z.union([z.string().regex(/^\d+$/), z.number().int()]).transform((v) => BigInt(v)),
  }),
  z.object({ verdict: z.literal("reject"), reason: z.string().min(1) }),
]);

export const POST = handle(async (req, { params }: Ctx) => {
  const { chargeId } = await params;
  await requireApprover(await requireCaller());
  const v = await body(req, input);
  if (v.verdict === "approve") return ok(await approveCharge(chargeId, { signature: v.signature as `0x${string}`, deadline: v.deadline }));
  return ok(await rejectCharge(chargeId, v.reason));
});
