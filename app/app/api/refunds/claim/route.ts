import { requireCaller } from "@/lib/server/auth";
import { claimRefunds } from "@/lib/server/episodes";
import { handle, ok } from "@/lib/server/route";

/** A payer collects refunds the contract couldn't send automatically (e.g. their wallet was briefly frozen). */
export const POST = handle(async () => ok(await claimRefunds(await requireCaller())));
