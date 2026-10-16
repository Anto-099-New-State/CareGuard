import { requireApprover, requireCaller } from "@/lib/server/auth";
import { traction } from "@/lib/server/episodes";
import { handle, ok } from "@/lib/server/route";

/** Real counts and volumes per network, excluding internal tests. Team only (approvers are the team). */
export const GET = handle(async () => {
  await requireApprover(await requireCaller());
  return ok(await traction());
});
