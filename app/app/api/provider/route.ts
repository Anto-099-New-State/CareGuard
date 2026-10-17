import { requireCaller, requireProvider } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/route";

/** The signed-in hospital's provider record. Created by choosing “Hospital” at first sign-in (POST /api/profile). */
export const GET = handle(async () => ok(await requireProvider(await requireCaller())));
