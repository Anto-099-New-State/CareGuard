"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Bits";
import { api } from "@/lib/client/api";
import { formatAmount, parseAmount } from "@/lib/money";

type Row = { key: string; id?: string; code: string; label: string; price: string };

const blank = (): Row => ({ key: crypto.randomUUID(), code: "", label: "", price: "" });
const input = "min-h-11 w-full rounded-[10px] border border-line bg-card px-3 text-sm text-ink";

export function PriceListEditor({ initial }: { initial: { id: string; code: string; label: string; unitPrice: string }[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initial.map((i) => ({ key: i.id, id: i.id, code: i.code, label: i.label, price: formatAmount(BigInt(i.unitPrice)).replace(/,/g, "") })));
  const [state, setState] = useState<{ busy: boolean; error: string; saved: boolean }>({ busy: false, error: "", saved: false });

  const update = (key: string, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setState((s) => ({ ...s, saved: false }));
  };

  const save = async () => {
    const filled = rows.filter((r) => r.code.trim() || r.label.trim() || r.price.trim());
    for (const r of filled) {
      if (!r.code.trim() || !r.label.trim() || !r.price.trim()) return setState({ busy: false, saved: false, error: "Every line needs a code, a label and a unit price." });
      try {
        if (parseAmount(r.price) <= 0n) throw new Error();
      } catch {
        return setState({ busy: false, saved: false, error: `${r.code || "A line"}: “${r.price}” isn't a price. Use digits like 120.00.` });
      }
    }
    const codes = filled.map((r) => r.code.trim().toUpperCase());
    if (new Set(codes).size !== codes.length) return setState({ busy: false, saved: false, error: "Each code can appear only once." });
    if (filled.length === 0) return setState({ busy: false, saved: false, error: "Add at least one line." });

    setState({ busy: true, error: "", saved: false });
    try {
      await api("/api/price-list", { body: { items: filled.map((r) => ({ code: r.code.trim().toUpperCase(), label: r.label.trim(), unitPrice: r.price.trim() })) } });
      setState({ busy: false, error: "", saved: true });
      router.refresh();
    } catch (err) {
      setState({ busy: false, saved: false, error: err instanceof Error ? err.message : "Couldn't save." });
    }
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No price list yet"
        action={<Button onClick={() => setRows([blank()])}>Add the first item</Button>}
      >
        Add each item you charge for: a short code (like IMP-01), what it is, and its unit price in USDC. Quotes and charges are built from these lines.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-[14px] border border-line">
        <table className="w-full min-w-[620px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-sm text-muted">
              <th className="border-b border-line px-3 py-3 font-medium">Code</th>
              <th className="border-b border-line px-3 py-3 font-medium">Item</th>
              <th className="border-b border-line px-3 py-3 text-right font-medium">Unit price (USDC)</th>
              <th className="border-b border-line px-3 py-3"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key}>
                <td className="w-[160px] border-b border-line px-3 py-2">
                  <input aria-label={`Code, line ${i + 1}`} className={`${input} font-mono uppercase`} value={r.code} onChange={(e) => update(r.key, { code: e.target.value })} placeholder="IMP-01" disabled={!!r.id} title={r.id ? "Codes can't change once saved; add a new line instead." : undefined} />
                </td>
                <td className="border-b border-line px-3 py-2">
                  <input aria-label={`Item, line ${i + 1}`} className={input} value={r.label} onChange={(e) => update(r.key, { label: e.target.value })} placeholder="Implant surgery" />
                </td>
                <td className="w-[180px] border-b border-line px-3 py-2">
                  <input aria-label={`Unit price, line ${i + 1}`} inputMode="decimal" className={`${input} text-right font-mono`} value={r.price} onChange={(e) => update(r.key, { price: e.target.value })} placeholder="300.00" />
                </td>
                <td className="w-[60px] border-b border-line px-3 py-2 text-right">
                  {!r.id && (
                    <button type="button" aria-label={`Remove line ${i + 1}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="h-11 w-11 cursor-pointer rounded-full border-0 bg-transparent text-muted hover:bg-chip">
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {state.error && <p role="alert" className="m-0 text-sm text-warn">{state.error}</p>}
      {state.saved && <p role="status" className="m-0 text-sm text-ok">✓ Saved.</p>}
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => setRows((rs) => [...rs, blank()])}>Add a line</Button>
        <Button onClick={save} disabled={state.busy}>{state.busy ? "Saving…" : "Save price list"}</Button>
        {initial.length > 0 && <ButtonLink href="/provider/episodes/new" variant="ghost">Create an episode →</ButtonLink>}
      </div>
    </div>
  );
}
