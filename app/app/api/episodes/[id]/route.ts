import { episodeAccess, requireCaller } from "@/lib/server/auth";
import { episodeView } from "@/lib/server/episodes";
import { handle, ok } from "@/lib/server/route";

type Ctx = { params: Promise<{ id: string }> };

/** Episode, balances, charges and decisions. Payers never see charge descriptions or decision inputs. */
export const GET = handle(async (_req, { params }: Ctx) => {
  const { id } = await params;
  const access = await episodeAccess(await requireCaller(), id);
  return ok(await episodeView(id, access));
});
