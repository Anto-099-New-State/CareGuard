"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button } from "./ui/Button";
import { Field } from "./ui/Field";

export function ProviderSetup() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/provider", { body: { name } });
      router.push("/provider/prices");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't set up your profile.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex max-w-[420px] flex-col gap-3">
      <Field label="Clinic or hospital name" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" />
      {error && <p role="alert" className="m-0 text-sm text-warn">{error}</p>}
      <Button type="submit" disabled={busy || !name.trim()} className="self-start">{busy ? "Creating your wallet…" : "Set up as a provider"}</Button>
    </form>
  );
}
