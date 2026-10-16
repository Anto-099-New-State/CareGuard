import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { db, must, type PayerRow, type ProviderRow } from "./db";
import { need } from "./env";
import { UserError } from "./errors";

export type Caller = { userId: string; email: string | null };

/** The signed-in user, from the Supabase session cookie or an `Authorization: Bearer` token. */
export async function getCaller(): Promise<Caller | null> {
  const auth = (await headers()).get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const { data } = await db().auth.getUser(auth.slice(7));
    return data.user ? { userId: data.user.id, email: data.user.email ?? null } : null;
  }

  const store = await cookies();
  const supabase = createServerClient(need("NEXT_PUBLIC_SUPABASE_URL"), need("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a route that can't set cookies; the session refresh happens on the next page load.
        }
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  return data.user ? { userId: data.user.id, email: data.user.email ?? null } : null;
}

export async function requireCaller(): Promise<Caller> {
  const caller = await getCaller();
  if (!caller) throw new UserError("Sign in to continue.", 401);
  return caller;
}

export async function requireProvider(caller: Caller): Promise<ProviderRow> {
  const res = await db().from("providers").select("*").eq("user_id", caller.userId).maybeSingle();
  return must(res, "Set up your provider profile first (POST /api/provider).") as ProviderRow;
}

export async function isApprover(caller: Caller): Promise<boolean> {
  const { data } = await db().from("approvers").select("user_id").eq("user_id", caller.userId).maybeSingle();
  return !!data;
}

export async function requireApprover(caller: Caller) {
  if (!(await isApprover(caller))) throw new UserError("Only the CareGuard approver can do that.", 403);
}

/**
 * The caller's payer row on an episode. Payers are invited by email, so the first time they sign in
 * with that email we link their account to the row.
 */
export async function payerFor(caller: Caller, episodeId: string): Promise<PayerRow | null> {
  const rows = must(await db().from("payers").select("*").eq("episode_id", episodeId)) as PayerRow[];
  const mine = rows.find((p) => p.user_id === caller.userId);
  if (mine) return mine;
  const invited = caller.email ? rows.find((p) => !p.user_id && p.email.toLowerCase() === caller.email!.toLowerCase()) : undefined;
  if (!invited) return null;
  must(await db().from("payers").update({ user_id: caller.userId }).eq("id", invited.id).select().single());
  return { ...invited, user_id: caller.userId };
}

/** Which parts of an episode the caller may see. */
export async function episodeAccess(caller: Caller, episodeId: string) {
  const { data: ep } = await db().from("episodes").select("provider_id").eq("id", episodeId).maybeSingle();
  if (!ep) throw new UserError("Episode not found.", 404);
  const { data: prov } = await db().from("providers").select("id").eq("user_id", caller.userId).maybeSingle();
  const provider = prov?.id === ep.provider_id;
  const approver = await isApprover(caller);
  const payer = provider || approver ? null : await payerFor(caller, episodeId);
  if (!provider && !approver && !payer) throw new UserError("Episode not found.", 404);
  return { provider, approver, payer };
}
