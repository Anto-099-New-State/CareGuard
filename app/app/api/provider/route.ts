import { z } from "zod";
import { requireCaller, requireProvider } from "@/lib/server/auth";
import { upsertProvider } from "@/lib/server/episodes";
import { body, handle, ok } from "@/lib/server/route";

/** The signed-in provider's profile and wallet. */
export const GET = handle(async () => ok(await requireProvider(await requireCaller())));

/** Creates (or renames) the signed-in user's provider profile, with a wallet that receives USDC. */
export const POST = handle(async (req) => {
  const caller = await requireCaller();
  const { name } = await body(req, z.object({ name: z.string().min(1) }));
  return ok(await upsertProvider(caller, name), 201);
});
