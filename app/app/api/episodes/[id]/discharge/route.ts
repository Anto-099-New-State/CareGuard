import { requireCaller, requireProvider } from "@/lib/server/auth";
import { discharge } from "@/lib/server/episodes";
import { handle, ok } from "@/lib/server/route";

type Ctx = { params: Promise<{ id: string }> };

/** Ends treatment: the contract returns each payer's remaining balance. */
export const POST = handle(async (_req, { params }: Ctx) => {
  const { id } = await params;
  const provider = await requireProvider(await requireCaller());
  return ok(await discharge(provider, id));
});
