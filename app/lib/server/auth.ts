import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { getAddress, isAddress, type Address } from "viem";
import { publicClient } from "../chains";
import { careGuard } from "../contract";
import { db, must, type PayerRow, type ProviderRow } from "./db";
import { need } from "./env";
import { UserError } from "./errors";

/** The signed-in user and the wallet they signed in with (Sign-In with Ethereum). */
export type Caller = { userId: string; wallet: Address };

/**
 * The wallet comes from the user's web3 identity (`web3:ethereum:0x…`), which Supabase sets from the verified
 * signature. Never from user_metadata: users can edit that themselves.
 */
function walletOf(user: User): Address | null {
  for (const identity of user.identities ?? []) {
    if (identity.provider !== "web3") continue;
    const sub = String(identity.identity_data?.sub ?? identity.id ?? "");
    const m = sub.match(/^web3:ethereum:(0x[0-9a-fA-F]{40})$/);
    if (m && isAddress(m[1])) return getAddress(m[1]);
  }
  return null;
}

async function userFromRequest(): Promise<User | null> {
  const auth = (await headers()).get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const { data } = await db().auth.getUser(auth.slice(7));
    return data.user ?? null;
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
  return data.user ?? null;
}

/** The signed-in wallet user, from the Supabase session cookie or an `Authorization: Bearer` token. */
export async function getCaller(): Promise<Caller | null> {
  const user = await userFromRequest();
  if (!user) return null;
  const wallet = walletOf(user);
  return wallet ? { userId: user.id, wallet } : null;
}

export async function requireCaller(): Promise<Caller> {
  const caller = await getCaller();
  if (!caller) throw new UserError("Connect your wallet and sign in to continue.", 401);
  return caller;
}

export type Profile = { user_id: string; wallet_address: string; role: "provider" | "patient"; display_name: string };

export async function getProfile(caller: Caller): Promise<Profile | null> {
  const { data } = await db().from("profiles").select("*").eq("user_id", caller.userId).maybeSingle();
  return (data as Profile | null) ?? null;
}

export async function requireProvider(caller: Caller): Promise<ProviderRow> {
  const res = await db().from("providers").select("*").eq("user_id", caller.userId).maybeSingle();
  return must(res, "This wallet isn't set up as a hospital or clinic. Choose “Hospital” when you first sign in.") as ProviderRow;
}

/** The approver is whoever holds the key the contract checks signatures against (or a listed team account). */
export async function isApprover(caller: Caller): Promise<boolean> {
  try {
    const onchain = await publicClient.readContract({ ...careGuard, functionName: "approver" });
    if (onchain.toLowerCase() === caller.wallet.toLowerCase()) return true;
  } catch {
    // Contract not reachable: fall back to the team list.
  }
  const { data } = await db().from("approvers").select("user_id").eq("user_id", caller.userId).maybeSingle();
  return !!data;
}

export async function requireApprover(caller: Caller) {
  if (!(await isApprover(caller))) throw new UserError("Only the CareGuard approver can do that.", 403);
}

/** The caller's payer row on an episode, matched by the wallet they signed in with; links the row on first visit. */
export async function payerFor(caller: Caller, episodeId: string): Promise<PayerRow | null> {
  const rows = must(await db().from("payers").select("*").eq("episode_id", episodeId)) as PayerRow[];
  const mine = rows.find((p) => p.user_id === caller.userId || p.wallet_address?.toLowerCase() === caller.wallet.toLowerCase());
  if (!mine) return null;
  if (mine.user_id !== caller.userId) {
    must(await db().from("payers").update({ user_id: caller.userId }).eq("id", mine.id).select().single());
  }
  return { ...mine, user_id: caller.userId };
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
