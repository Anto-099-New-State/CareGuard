import { redirect } from "next/navigation";
import { getCaller, isApprover, type Caller } from "./auth";
import { db, type ProviderRow } from "./db";

export type Session = { caller: Caller; provider: ProviderRow | null; approver: boolean };

/** The signed-in user and their roles, or null. For server components. */
export async function getSession(): Promise<Session | null> {
  const caller = await getCaller();
  if (!caller) return null;
  const [{ data: provider }, approver] = await Promise.all([
    db().from("providers").select("*").eq("user_id", caller.userId).maybeSingle(),
    isApprover(caller),
  ]);
  return { caller, provider: (provider as ProviderRow | null) ?? null, approver };
}

/** Like getSession, but sends signed-out visitors to sign in and back here afterwards. */
export async function requireSession(next: string): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(`/signin?next=${encodeURIComponent(next)}`);
  return s;
}
