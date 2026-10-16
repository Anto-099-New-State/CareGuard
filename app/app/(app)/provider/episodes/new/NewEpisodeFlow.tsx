"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, SplitBar, Stat } from "@/components/ui/Bits";
import { Field, Select } from "@/components/ui/Field";
import { Money } from "@/components/ui/Money";
import { TxStatus, type TxState } from "@/components/ui/Tx";
import { api } from "@/lib/client/api";
import { formatMoney } from "@/lib/money";

type Item = { id: string; code: string; label: string; unitPrice: string };
type Line = { key: string; priceItemId: string; quantity: string };
type Sizing = { quote: string; guarantee: string; perChargeCap: string; covererOwes: string; familyOwes: string; reason: string };
type Payer = { email: string; name: string; currency: "USDC" | "EURC" };

const newLine = (id = ""): Line => ({ key: crypto.randomUUID(), priceItemId: id, quantity: "1" });
const qty = (q: string) => (/^\d+$/.test(q) ? Number(q) : 0);

export function NewEpisodeFlow({ items, defaults }: { items: Item[]; defaults: { contingencyPct: number; capPct: number } }) {
  const [patientLabel, setPatientLabel] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine(items[0]?.id)]);
  const [covered, setCovered] = useState<string[]>([]);
  const [coveredPct, setCoveredPct] = useState("100");
  const [contingencyPct, setContingencyPct] = useState(String(defaults.contingencyPct));
  const [internal, setInternal] = useState(false);
  const [created, setCreated] = useState<{ id: string; sizing: Sizing } | null>(null);
  const [payers, setPayers] = useState<{ coverer: Payer; family: Payer }>({
    coverer: { email: "", name: "", currency: "USDC" },
    family: { email: "", name: "", currency: "USDC" },
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tx, setTx] = useState<TxState | null>(null);

  const byId = (id: string) => items.find((i) => i.id === id);
  const quote = useMemo(() => lines.reduce((s, l) => s + (byId(l.priceItemId) ? BigInt(byId(l.priceItemId)!.unitPrice) * BigInt(qty(l.quantity)) : 0n), 0n), [lines]); // eslint-disable-line react-hooks/exhaustive-deps
  const codesInQuote = [...new Set(lines.map((l) => byId(l.priceItemId)?.code).filter(Boolean) as string[])];

  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const createEpisode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const valid = lines.filter((l) => l.priceItemId && qty(l.quantity) > 0);
    if (!patientLabel.trim()) return setError("Enter how to refer to the patient, e.g. “Maria L.”. No medical details.");
    if (valid.length !== lines.length) return setError("Each quote line needs an item and a whole-number quantity.");
    const ids = valid.map((l) => l.priceItemId);
    if (new Set(ids).size !== ids.length) return setError("Each item can appear once; raise its quantity instead.");
    setBusy(true);
    try {
      const res = await api<{ episode: { id: string }; sizing: Sizing }>("/api/episodes", {
        body: {
          patientLabel,
          description,
          lines: valid.map((l) => ({ priceItemId: l.priceItemId, quantity: qty(l.quantity) })),
          contingencyPct: Number(contingencyPct),
          coveredCodes: covered.filter((c) => codesInQuote.includes(c)),
          coveredPct: Number(coveredPct),
          isInternalTest: internal,
        },
      });
      setCreated({ id: res.episode.id, sizing: res.sizing });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the episode.");
    } finally {
      setBusy(false);
    }
  };

  const addPayers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!created) return;
    setError("");
    setTx({ status: "pending" });
    try {
      const res = await api<{ txHash: string }>(`/api/episodes/${created.id}/payers`, { body: payers });
      setTx({ status: "confirmed", hash: res.txHash });
    } catch (err) {
      setTx({ status: "failed", error: err instanceof Error ? err.message : "Couldn't create the episode onchain." });
    }
  };

  if (created) {
    const s = created.sizing;
    const done = tx?.status === "confirmed";
    return (
      <div className="flex flex-col gap-6">
        <Card title="The agent sized the guarantee">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4">
            <Stat label="Quote"><Money value={s.quote} /></Stat>
            <Stat label="Guarantee"><Money value={s.guarantee} /></Stat>
            <Stat label="Per-charge cap" note="Above this, a human signs"><Money value={s.perChargeCap} /></Stat>
          </div>
          <p className="m-0 rounded-[10px] bg-surface px-4 py-3 text-sm"><span className="font-semibold">Why: </span>{s.reason}</p>
          <div className="flex flex-col gap-2">
            <SplitBar covered={BigInt(s.covererOwes)} total={BigInt(s.guarantee)} />
            <span className="text-sm text-muted">
              Coverer funds <Money value={s.covererOwes} />, family funds <Money value={s.familyOwes} />. Unused money returns to each of them at discharge.
            </span>
          </div>
        </Card>

        <Card title="Add the payers">
          <p className="m-0 text-sm text-muted">Each payer gets a wallet and a link to their funding page. They sign in with this email.</p>
          <form onSubmit={addPayers} className="flex flex-col gap-5">
            {(["coverer", "family"] as const).map((role) => (
              <fieldset key={role} disabled={done || tx?.status === "pending"} className="m-0 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 rounded-[12px] border border-line p-4">
                <legend className="px-1 text-sm font-bold">{role === "coverer" ? "Coverer (insurer, employer or a relative paying covered items)" : "Family payer (everything else)"}</legend>
                <Field label="Name" required value={payers[role].name} onChange={(e) => setPayers((p) => ({ ...p, [role]: { ...p[role], name: e.target.value } }))} />
                <Field label="Email" type="email" required value={payers[role].email} onChange={(e) => setPayers((p) => ({ ...p, [role]: { ...p[role], email: e.target.value } }))} />
                <Select label="Pays in" value={payers[role].currency} onChange={(e) => setPayers((p) => ({ ...p, [role]: { ...p[role], currency: e.target.value as Payer["currency"] } }))}>
                  <option value="USDC">USDC</option>
                  <option value="EURC">EURC (swapped to USDC)</option>
                </Select>
              </fieldset>
            ))}
            {tx && <TxStatus state={tx} label="Creating the episode onchain" />}
            {done ? (
              <div className="flex flex-wrap gap-3">
                <ButtonLink href={`/provider/episodes/${created.id}`}>Open the episode</ButtonLink>
                <span className="self-center text-sm text-muted">Share each payer&apos;s link: <code className="font-mono">/pay/{created.id}</code></span>
              </div>
            ) : (
              <Button type="submit" disabled={tx?.status === "pending"} className="self-start">
                {tx?.status === "pending" ? "Creating…" : tx?.status === "failed" ? "Try again" : "Create episode onchain"}
              </Button>
            )}
          </form>
        </Card>
      </div>
    );
  }

  return (
    <form onSubmit={createEpisode} className="flex flex-col gap-6">
      <Card title="Patient">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
          <Field label="Refer to the patient as" required value={patientLabel} onChange={(e) => setPatientLabel(e.target.value)} placeholder="Maria L." hint="A short label. Payers see it; no medical details." />
          <Field label="Treatment (only you and the approver see this)" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="implant + crown" />
        </div>
      </Card>

      <Card title="Quote" aside={<strong className="font-mono text-base">{formatMoney(quote)}</strong>}>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {lines.map((l, i) => {
            const item = byId(l.priceItemId);
            return (
              <li key={l.key} className="grid grid-cols-[minmax(0,1fr)_100px_auto_auto] items-end gap-3 max-sm:grid-cols-[minmax(0,1fr)_80px]">
                <Select label={`Item ${i + 1}`} value={l.priceItemId} onChange={(e) => setLine(l.key, { priceItemId: e.target.value })}>
                  <option value="">Choose an item…</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>{it.code} · {it.label} · {formatMoney(BigInt(it.unitPrice))}</option>
                  ))}
                </Select>
                <Field label="Quantity" inputMode="numeric" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} />
                <span className="flex min-h-11 items-center justify-end font-mono text-sm">{item ? formatMoney(BigInt(item.unitPrice) * BigInt(qty(l.quantity))) : "—"}</span>
                <button type="button" aria-label={`Remove item ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="h-11 w-11 cursor-pointer rounded-full border-0 bg-transparent text-muted hover:bg-chip disabled:opacity-30">✕</button>
              </li>
            );
          })}
        </ul>
        <Button variant="secondary" className="self-start" onClick={() => setLines((ls) => [...ls, newLine()])}>Add an item</Button>
        {items.length > 0 && <span className="text-xs text-muted">Missing an item? <Link className="hover-link underline" href="/provider/prices">Add it to your price list</Link>.</span>}
      </Card>

      <Card title="Coverage">
        <p className="m-0 text-sm text-muted">Which items the coverer pays for. Everything else is paid by the family.</p>
        {codesInQuote.length === 0 ? (
          <p className="m-0 text-sm text-muted">Add quote items to choose what&apos;s covered.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {codesInQuote.map((code) => (
              <label key={code} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-4 text-sm has-[:checked]:border-strong has-[:checked]:bg-chip">
                <input type="checkbox" checked={covered.includes(code)} onChange={(e) => setCovered((c) => (e.target.checked ? [...c, code] : c.filter((x) => x !== code)))} />
                <span className="font-mono">{code}</span>
              </label>
            ))}
          </div>
        )}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <Field label="Share of covered items the coverer pays (%)" inputMode="decimal" value={coveredPct} onChange={(e) => setCoveredPct(e.target.value)} />
          <Field label="Contingency on top of the quote (%)" inputMode="decimal" value={contingencyPct} onChange={(e) => setContingencyPct(e.target.value)} hint="No cost history yet, so the agent adds this margin." />
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
          This is our own test (excluded from traction numbers)
        </label>
      </Card>

      {error && <p role="alert" className="m-0 text-sm text-warn">{error}</p>}
      <Button type="submit" disabled={busy || quote === 0n} className="self-start">{busy ? "Sizing…" : "Size the guarantee"}</Button>
    </form>
  );
}
