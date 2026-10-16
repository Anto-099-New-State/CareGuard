"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { supabaseBrowser } from "@/lib/supabase/browser";

export function SignInForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState(params.get("error") === "link" ? "That sign-in link has expired or was already used. Send a new one." : "");

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setState("sending");
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setError(`Couldn't send the link: ${error.message}`);
      setState("idle");
    } else {
      setState("sent");
    }
  };

  if (state === "sent") {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-[14px] bg-ok-bg p-5 text-ok">
        <strong>Check your email</strong>
        <span className="text-sm text-ink">
          We sent a sign-in link to {email}. It works once and expires in an hour.
        </span>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="flex flex-col gap-4">
      <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      {error && <p role="alert" className="m-0 text-sm text-warn">{error}</p>}
      <Button type="submit" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Email me a link"}</Button>
    </form>
  );
}
