"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HospitalIcon, PayersIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { api } from "@/lib/client/api";

type Role = "provider" | "patient";

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

/**
 * Role choice. On first sign-in it sets the default (`mode="first"`); on Account & role it switches (`mode="switch"`),
 * keeping all data. Names are prefilled when the wallet already has them.
 */
export function RoleChooser({ next, mode = "first", current = null, names = {} }: { next: string; mode?: "first" | "switch"; current?: Role | null; names?: Partial<Record<Role, string>> }) {
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(current);
  const [nameByRole, setNameByRole] = useState<Partial<Record<Role, string>>>(names);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const chosen = ROLES.find((r) => r.id === role);
  const name = role ? (nameByRole[role] ?? "") : "";
  const unchanged = mode === "switch" && role === current && name === (names[role ?? "patient"] ?? "");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await api("/api/profile", { method: mode === "first" ? "POST" : "PATCH", body: { role, name } });
      if (mode === "first") {
        router.push(role === "provider" && next === "/dashboard" ? "/provider/prices" : next);
      } else {
        setSaved(true);
        router.push(next);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your choice.");
    } finally {
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
            className={`lift relative flex cursor-pointer flex-col gap-3 rounded-2xl border-2 bg-card p-5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-strong ${role === r.id ? "border-strong" : "border-line"}`}
          >
            <input type="radio" name="role" value={r.id} checked={role === r.id} onChange={() => setRole(r.id)} className="sr-only" />
            {mode === "switch" && current === r.id && (
              <span className="absolute top-4 right-4 rounded-full bg-chip px-2.5 py-1 text-xs font-bold text-muted">Current</span>
            )}
            <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${role === r.id ? "bg-strong text-white" : "bg-chip text-ink"}`}>{r.icon}</span>
            <strong className="font-display text-lg">{r.title}</strong>
            <span className="text-sm leading-relaxed text-muted">{r.body}</span>
          </label>
        ))}
      </fieldset>
      {chosen && (
        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5">
          <Field
            label={chosen.nameLabel}
            required={mode === "first" || !names[chosen.id]}
            value={name}
            onChange={(e) => setNameByRole((n) => ({ ...n, [chosen.id]: e.target.value }))}
            autoComplete={role === "provider" ? "organization" : "name"}
          />
          {mode === "switch" && role !== current && (
            <p className="m-0 text-xs leading-relaxed text-muted">
              Switching changes what you see first and which actions you can take. Nothing is deleted: your {current === "provider" ? "hospital's episodes" : "treatments"} stay, and you can switch back any time.
            </p>
          )}
          {error && <p role="alert" className="m-0 text-sm text-warn">{error}</p>}
          {saved && <p role="status" className="m-0 text-sm text-ok">✓ Saved.</p>}
          <Button type="submit" disabled={busy || unchanged || (!name.trim() && (mode === "first" || !names[chosen.id]))} className="self-start">
            {busy ? "Saving…" : mode === "first" ? "Continue" : role === current ? "Save name" : `Switch to ${chosen.title.toLowerCase()}`}
          </Button>
        </div>
      )}
    </form>
  );
}
