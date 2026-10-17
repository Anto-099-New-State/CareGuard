import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { getSession } from "@/lib/server/session";
import { RoleChooser } from "./RoleChooser";

export const metadata: Metadata = { title: "Welcome · CareGuard" };
export const dynamic = "force-dynamic";

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: nextParam } = await searchParams;
  const next = nextParam?.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";
  const s = await getSession();
  if (!s) redirect(`/signin?next=${encodeURIComponent(next)}`);
  // Returning wallets, and the approver (recognised by its key), skip straight on.
  if (s.profile || s.approver) redirect(next);
  const wallet = s.caller.wallet;

  return (
    <main className="flex min-h-[85vh] items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-[640px] flex-col gap-7">
        <Logo />
        <div className="flex flex-col gap-2">
          <h1 className="m-0 font-display text-[32px] leading-tight font-bold tracking-[-0.025em]">How will you use CareGuard?</h1>
          <p className="m-0 text-base leading-relaxed text-muted">
            Signed in as <code className="font-mono text-ink">{wallet.slice(0, 6)}…{wallet.slice(-4)}</code>. Pick how you&apos;ll start; this becomes your
            default, and you can switch any time from Account &amp; role.
          </p>
        </div>
        <Suspense>
          <RoleChooser next={next} />
        </Suspense>
      </div>
    </main>
  );
}
