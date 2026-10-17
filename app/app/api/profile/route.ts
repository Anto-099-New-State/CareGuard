import { z } from "zod";
import { getProfile, requireCaller } from "@/lib/server/auth";
import { createProfile } from "@/lib/server/episodes";
import { body, handle, ok } from "@/lib/server/route";

/** The signed-in wallet's profile, or null before they've chosen a role. */
export const GET = handle(async () => ok(await getProfile(await requireCaller())));

/** First sign-in: choose hospital or patient. Hospitals are paid at the wallet they signed in with. */
export const POST = handle(async (req) => {
  const caller = await requireCaller();
  const input = await body(req, z.object({ role: z.enum(["provider", "patient"]), name: z.string().min(1).max(120) }));
  return ok(await createProfile(caller, input), 201);
});
