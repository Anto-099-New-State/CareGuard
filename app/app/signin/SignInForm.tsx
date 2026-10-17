"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createSiweMessage, generateSiweNonce } from "viem/siwe";
import { Button } from "@/components/ui/Button";
import { config } from "@/lib/config";
import { connectWallet, walletMessage } from "@/lib/client/wallet";
import { supabaseBrowser } from "@/lib/supabase/browser";

/** Sign-In with Ethereum: the wallet signs one message (no gas), Supabase verifies it and starts a session. */
export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";
  const [state, setState] = useState<"idle" | "connecting" | "signing">("idle");
  const [error, setError] = useState("");

  const signIn = async () => {
    setError("");
    setState("connecting");
    try {
      const { wallet, address } = await connectWallet();
      setState("signing");
      const message = createSiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to CareGuard. This only proves you own this wallet; it doesn't move any money.",
        uri: window.location.origin,
        version: "1",
        chainId: config.chainId,
        nonce: generateSiweNonce(),
        issuedAt: new Date(),
      });
      const signature = await wallet.signMessage({ account: address, message });
      const { error } = await supabaseBrowser().auth.signInWithWeb3({ chain: "ethereum", message, signature });
      if (error) throw new Error(`Sign-in failed: ${error.message}`);
      router.push(`/onboarding?next=${encodeURIComponent(next)}`);
      router.refresh();
    } catch (err) {
      setError(walletMessage(err));
      setState("idle");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Button onClick={signIn} disabled={state !== "idle"} className="min-h-12 w-full text-base">
        {state === "connecting" ? "Connecting your wallet…" : state === "signing" ? "Sign the message in your wallet…" : "Connect wallet"}
      </Button>
      {error && <p role="alert" className="m-0 text-sm text-warn">{error}</p>}
      <p className="m-0 text-xs leading-relaxed text-muted">
        You&apos;ll sign a short message to prove you own the wallet. It&apos;s free and moves no money. Use the wallet you&apos;ll pay from (or be paid
        to, for hospitals) on Arc {config.network}.
      </p>
    </div>
  );
}
