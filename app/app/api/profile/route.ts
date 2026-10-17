import { z } from "zod";
import { getProfile, requireCaller } from "@/lib/server/auth";
import { saveProfile } from "@/lib/server/episodes";
import { body, handle, ok } from "@/lib/server/route";

/** The signed-in wallet's profile, or null before they've chosen a role. */
export const GET = handle(async () => ok(await getProfile(await requireCaller())));

const input = z.object({ role: z.enum(["provider", "patient"]), name: z.string().max(120).optional() });

/** First sign-in: choose hospital or patient. That's the default; PATCH changes it any time. */
export const POST = handle(async (req) => ok(await saveProfile(await requireCaller(), await body(req, input)), 201));

/** Switch role. Hospitals are paid at the wallet they signed in with; switching keeps all data. */
export const PATCH = handle(async (req) => ok(await saveProfile(await requireCaller(), await body(req, input))));
