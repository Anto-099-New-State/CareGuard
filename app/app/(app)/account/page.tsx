import type { Metadata } from "next";
import { RoleChooser } from "@/app/onboarding/RoleChooser";
import { PageHeader } from "@/components/ui/PageHeader";
import { db } from "@/lib/server/db";
import { requireSession } from "@/lib/server/session";

export const metadata: Metadata = { title: "Account & role · CareGuard" };

/** Your wallet and role. The role chosen at first sign-in is the default; switch it here any time. */
export default async function Account() {
  const s = await requireSession("/account");
  const { data: hospital } = await db().from("providers").select("name").eq("user_id", s.caller.userId).maybeSingle();
  const wallet = s.caller.wallet;

  return (
    <>
      <PageHeader title="Account & role" subtitle="The role you chose at first sign-in is your default. Switch any time; nothing is deleted when you do." />
      <section className="flex flex-col gap-1.5 rounded-2xl border border-line bg-card p-5 text-sm">
        <span className="eyebrow">Signed in with</span>
        <code className="font-mono text-sm break-all">{wallet}</code>
        <span className="text-xs text-muted">
          {s.profile?.role === "provider" ? "Charges are paid to this wallet." : "You fund and receive refunds with this wallet."}
          {s.approver && " This wallet also holds the approver key."}
        </span>
      </section>
      <RoleChooser
        mode="switch"
        next="/dashboard"
        current={s.profile?.role ?? null}
        names={{ provider: hospital?.name ?? "", patient: s.profile?.display_name ?? "" }}
      />
    </>
  );
}
