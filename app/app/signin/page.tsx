import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/server/session";
import { Logo } from "@/components/Logo";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Launch CareGuard" };
export const dynamic = "force-dynamic";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: nextParam } = await searchParams;
  const next = nextParam?.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";
  // Already connected: skip straight on (onboarding asks for a role if this wallet has none yet).
  if (await getSession()) redirect(`/onboarding?next=${encodeURIComponent(next)}`);
  return (
    <main className="flex min-h-[80vh] items-center justify-center px-4 py-16">
      <div className="flex w-full max-w-[420px] flex-col gap-7 rounded-[20px] border border-line bg-card p-8">
        <Logo />
        <div className="flex flex-col gap-2">
          <h1 className="m-0 font-display text-[28px] font-bold tracking-[-0.02em]">Connect your wallet</h1>
          <p className="m-0 text-sm leading-relaxed text-muted">
            Connect your wallet. Hospitals are paid to it; patients and families pay from it.
          </p>
        </div>
        <Suspense>
          <SignInForm />
        </Suspense>
      </div>
    </main>
  );
}
