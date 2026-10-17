"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HospitalIcon, PayersIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { api } from "@/lib/client/api";

const ROLES = [
  {
    id: "provider" as const,
    title: "Hospital or clinic",
    body: "Set your price list, open an episode from a patient's quote, and get paid in USDC to this wallet for each charge.",
    icon: <HospitalIcon size={22} />,
    nameLabel: "Hospital or clinic name",
  },
  {
    id: "patient" as const,
    title: "Patient or family",
    body: "See your treatment's quote and every charge, fund your share from this wallet, and get back what isn't used. Insurers paying for a patient choose this too.",
    icon: <PayersIcon size={22} />,
    nameLabel: "Your name",
  },
];

export function RoleChooser({ next }: { next: string }) {
  const router = useRouter();
  const [role, setRole] = useState<"provider" | "patient" | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const chosen = ROLES.find((r) => r.id === role);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/profile", { body: { role, name } });
      router.push(role === "provider" && next === "/dashboard" ? "/provider/prices" : next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your choice.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <fieldset className="m-0 grid grid-cols-1 gap-3 border-0 p-0 sm:grid-cols-2">
        <legend className="sr-only">Role</legend>
        {ROLES.map((r) => (
          <label
            key={r.id}
            className={`lift flex cursor-pointer flex-col gap-3 rounded-2xl border-2 bg-card p-5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-strong ${role === r.id ? "border-strong" : "border-line"}`}
          >
            <input type="radio" name="role" value={r.id} checked={role === r.id} onChange={() => setRole(r.id)} className="sr-only" />
            <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${role === r.id ? "bg-strong text-white" : "bg-chip text-ink"}`}>{r.icon}</span>
            <strong className="font-display text-lg">{r.title}</strong>
            <span className="text-sm leading-relaxed text-muted">{r.body}</span>
          </label>
        ))}
      </fieldset>
      {chosen && (
        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5">
          <Field label={chosen.nameLabel} required value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete={role === "provider" ? "organization" : "name"} />
          {error && <p role="alert" className="m-0 text-sm text-warn">{error}</p>}
          <Button type="submit" disabled={busy || !name.trim()} className="self-start">
            {busy ? "Saving…" : "Continue"}
          </Button>
        </div>
      )}
    </form>
  );
}
