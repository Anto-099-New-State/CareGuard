import { requireApprover, requireCaller } from "@/lib/server/auth";
import { listApprovals } from "@/lib/server/episodes";
import { handle, ok } from "@/lib/server/route";

/** Escalated charges, each with the agent's reason and the exact EIP-712 message to sign. */
export const GET = handle(async () => {
  await requireApprover(await requireCaller());
  return ok(await listApprovals());
});
