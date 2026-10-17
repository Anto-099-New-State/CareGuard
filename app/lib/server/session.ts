import { redirect } from "next/navigation";
import { getCaller, getProfile, isApprover, type Caller, type Profile } from "./auth";
import { db, type ProviderRow } from "./db";

export type Session = { caller: Caller; profile: Profile | null; provider: ProviderRow | null; approver: boolean };

/** The signed-in wallet, its profile and roles, or null. For server components. */
export async function getSession(): Promise<Session | null> {
  const caller = await getCaller();
  if (!caller) return null;
  const [profile, { data: provider }, approver] = await Promise.all([
    getProfile(caller),
    db().from("providers").select("*").eq("user_id", caller.userId).maybeSingle(),
    isApprover(caller),
  ]);
  return { caller, profile, provider: (provider as ProviderRow | null) ?? null, approver };
}

/**
 * Sends signed-out visitors to sign in, and first-time wallets to choose a role, then back to `next`.
 * The approver doesn't need a role: they're recognised by their wallet.
 */
export async function requireSession(next: string): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(`/signin?next=${encodeURIComponent(next)}`);
  if (!s.profile && !s.approver) redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  return s;
}
