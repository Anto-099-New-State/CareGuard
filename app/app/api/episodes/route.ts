import { z } from "zod";
import { requireCaller, requireProvider } from "@/lib/server/auth";
import { db, must } from "@/lib/server/db";
import { createEpisode } from "@/lib/server/episodes";
import { body, handle, ok, percent } from "@/lib/server/route";

/** The provider's episodes, newest first. */
export const GET = handle(async () => {
  const provider = await requireProvider(await requireCaller());
  return ok(must(await db().from("episodes").select("*, payers(role, display_name, funded_usdc)").eq("provider_id", provider.id).order("created_at", { ascending: false })));
});

/** Creates an episode from a quote; the agent sizes the guarantee and returns its reason. */
export const POST = handle(async (req) => {
  const provider = await requireProvider(await requireCaller());
  const input = await body(
    req,
    z.object({
      patientLabel: z.string().min(1),
      patientWallet: z.string().min(1),
      description: z.string().default(""),
      lines: z.array(z.object({ priceItemId: z.string().uuid(), quantity: z.number().int().positive() })).min(1),
      contingencyPct: percent.optional(),
      capPct: percent.optional(),
      coveredCodes: z.array(z.string()).default([]),
      coveredPct: percent.default(10_000),
      isInternalTest: z.boolean().default(false),
    }),
  );
  const { contingencyPct, capPct, coveredPct, ...rest } = input;
  return ok(await createEpisode(provider, { ...rest, contingencyBps: contingencyPct, capBps: capPct, coveredBps: coveredPct }), 201);
});
