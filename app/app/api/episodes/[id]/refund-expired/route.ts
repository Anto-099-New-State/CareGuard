import { refundExpired } from "@/lib/server/episodes";
import { handle, ok } from "@/lib/server/route";

type Ctx = { params: Promise<{ id: string }> };

/** Anyone may trigger the refund after expiry. No sign-in: the contract enforces the rules. */
export const POST = handle(async (_req, { params }: Ctx) => {
  const { id } = await params;
  return ok(await refundExpired(id));
});
