import { z } from "zod";
import { requireCaller, requireProvider } from "@/lib/server/auth";
import { addPayers } from "@/lib/server/episodes";
import { body, currency, handle, ok } from "@/lib/server/route";

type Ctx = { params: Promise<{ id: string }> };

const payer = z.object({ email: z.string().email(), name: z.string().min(1), currency: currency.default("USDC") });

/** Adds the coverer and family payer, creates their wallets and creates the episode onchain. */
export const POST = handle(async (req, { params }: Ctx) => {
  const { id } = await params;
  const provider = await requireProvider(await requireCaller());
  const input = await body(req, z.object({ coverer: payer, family: payer }));
  return ok(await addPayers(provider, id, input), 201);
});
