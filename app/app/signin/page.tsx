import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in · CareGuard" };

export default function SignIn() {
  return (
    <main className="flex min-h-[80vh] items-center justify-center px-4 py-16">
      <div className="flex w-full max-w-[420px] flex-col gap-7 rounded-[20px] border border-line bg-card p-8">
        <Logo />
        <div className="flex flex-col gap-2">
          <h1 className="m-0 font-display text-[28px] font-bold tracking-[-0.02em]">Sign in</h1>
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
