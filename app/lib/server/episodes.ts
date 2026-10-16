import { parseEventLogs, type Address, type Hash, type Hex } from "viem";
import { chargeJudge } from "../agent/llm";
import { marginCallsNeeded, reviewCharge, type EpisodeState, type PastCharge } from "../agent/review";
import { sizeGuarantee, type QuoteLine } from "../agent/sizing";
import { publicClient } from "../chains";
import { config } from "../config";
import { CONTRACT_STATUS, DECISION_KIND, careGuard, careGuardAbi, erc20Abi } from "../contract";
import { approveChargeTypes, eip712Domain } from "../eip712";
import { formatAmount, type Currency } from "../money";
import { payerFor, type Caller } from "./auth";
import { agentSigner, send, type Signer } from "./chain";
import { big, db, must, str, type ChargeRow, type EpisodeRow, type PayerRow, type PriceItemRow, type ProviderRow } from "./db";
import { settings } from "./env";
import { UserError } from "./errors";
import { canonicalJson, saltedHash } from "./hash";
import { swapEurcToUsdc } from "./swap";
import { createWallet } from "./wallets";

type DecisionKind = (typeof DECISION_KIND)[number];
type DecisionOutcome = "sized" | "pay" | "escalate" | "margin_call" | "reject" | "approve" | "discharge";
type TxKind = "create" | "fund" | "swap" | "charge" | "margin_call" | "decision" | "refund";

const json = (v: unknown) => JSON.parse(canonicalJson(v));
const roleLabel = (role: "coverer" | "family") => (role === "coverer" ? "coverer" : "family");

// ------------------------------------------------------------------ loaders

async function loadEpisode(id: string): Promise<EpisodeRow> {
  return must(await db().from("episodes").select("*").eq("id", id).maybeSingle(), "Episode not found.") as EpisodeRow;
}

function ownEpisode(provider: ProviderRow, ep: EpisodeRow) {
  if (ep.provider_id !== provider.id) throw new UserError("Episode not found.", 404);
}

function contractId(ep: EpisodeRow): bigint {
  if (ep.contract_episode_id === null) throw new UserError("Add both payers first; the episode isn't onchain yet.", 409);
  return BigInt(ep.contract_episode_id);
}

async function loadQuote(episodeId: string): Promise<QuoteLine[]> {
  const rows = must(
    await db().from("quote_items").select("price_item_id, quantity, price_items(code, unit_price_usdc)").eq("episode_id", episodeId),
  ) as unknown as { price_item_id: string; quantity: number; price_items: { code: string; unit_price_usdc: number } }[];
  return rows.map((r) => ({ priceItemId: r.price_item_id, code: r.price_items.code, unitPrice: big(r.price_items.unit_price_usdc), quantity: r.quantity }));
}

async function loadPayers(episodeId: string): Promise<Record<"coverer" | "family", PayerRow>> {
  const rows = must(await db().from("payers").select("*").eq("episode_id", episodeId)) as PayerRow[];
  const coverer = rows.find((r) => r.role === "coverer");
  const family = rows.find((r) => r.role === "family");
  if (!coverer || !family) throw new UserError("This episode needs a coverer and a family payer.", 409);
  return { coverer, family };
}

async function providerOf(ep: EpisodeRow): Promise<ProviderRow> {
  return must(await db().from("providers").select("*").eq("id", ep.provider_id).single()) as ProviderRow;
}

const signerOf = (row: { wallet_address: string | null; wallet_id: string | null }): Signer => {
  if (!row.wallet_address) throw new UserError("This party has no wallet yet.", 409);
  return { address: row.wallet_address as Address, walletId: row.wallet_id };
};

/** Block time, which is what the contract compares expiry and deadlines against. */
async function chainNow(): Promise<bigint> {
  return (await publicClient.getBlock()).timestamp;
}

/** The contract is the truth: read the episode from the chain. */
async function onchain(id: bigint) {
  return publicClient.readContract({ ...careGuard, functionName: "getEpisode", args: [id] });
}

/** Copies money state from the chain into the database cache. Safe to run any number of times. */
export async function refreshFromChain(ep: EpisodeRow): Promise<EpisodeRow> {
  if (ep.contract_episode_id === null) return ep;
  const e = await onchain(BigInt(ep.contract_episode_id));
  let status = CONTRACT_STATUS[e.status] as EpisodeRow["status"] | "none";
  if (status === "none") return ep;
  if (status === "created") {
    const payers = await loadPayers(ep.id);
    if (big(payers.coverer.funded_usdc) > 0n && big(payers.family.funded_usdc) > 0n) status = "funded";
  }
  return must(
    await db()
      .from("episodes")
      .update({ coverer_balance: str(e.covererBalance), family_balance: str(e.familyBalance), paid_total: str(e.paidTotal), status })
      .eq("id", ep.id)
      .select()
      .single(),
  ) as EpisodeRow;
}

// ------------------------------------------------------------------ records

/** Runs a transaction with a visible pending → confirmed / failed row. */
async function tracked(
  row: { episodeId: string | null; kind: TxKind; payerId?: string | null; amount?: bigint | null; currency?: Currency | null },
  run: () => Promise<Hash>,
): Promise<Hash> {
  const pending = must(
    await db()
      .from("transactions")
      .insert({
        episode_id: row.episodeId,
        kind: row.kind,
        payer_id: row.payerId ?? null,
        amount: row.amount === undefined || row.amount === null ? null : str(row.amount),
        currency: row.currency ?? null,
        network: config.network,
      })
      .select("id")
      .single(),
  ) as { id: string };
  try {
    const hash = await run();
    await db().from("transactions").update({ status: "confirmed", tx_hash: hash }).eq("id", pending.id);
    return hash;
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error.";
    await db().from("transactions").update({ status: "failed", error: reason }).eq("id", pending.id);
    throw err;
  }
}

/**
 * Writes the decision with its plain-language reason, then logs its salted hash onchain.
 * The row exists before any onchain action, so every move of money has a recorded reason.
 */
async function decide(
  ep: EpisodeRow,
  d: { kind: DecisionKind; outcome: DecisionOutcome; reason: string; inputs: unknown; chargeId?: string; verdict?: "approved" | "rejected" },
) {
  const payload = { episodeId: ep.id, kind: d.kind, outcome: d.outcome, reason: d.reason, inputs: d.inputs };
  const { salt, hash } = saltedHash(payload);
  const row = must(
    await db()
      .from("decisions")
      .insert({
        episode_id: ep.id,
        charge_id: d.chargeId ?? null,
        kind: d.kind,
        inputs: json(d.inputs),
        outcome: d.outcome,
        reason: d.reason,
        salt,
        hash,
        approver_verdict: d.verdict ?? null,
      })
      .select("id")
      .single(),
  ) as { id: string };

  if (ep.contract_episode_id !== null) await logDecisionOnchain(ep, row.id, d.kind, hash);
  return { id: row.id, hash };
}

async function logDecisionOnchain(ep: EpisodeRow, decisionId: string, kind: DecisionKind, hash: Hex) {
  const txHash = await tracked({ episodeId: ep.id, kind: "decision" }, () =>
    send(agentSigner(), { ...careGuard, functionName: "logDecision", args: [contractId(ep), DECISION_KIND.indexOf(kind), hash] }),
  );
  await db().from("decisions").update({ tx_hash: txHash }).eq("id", decisionId);
}

// ------------------------------------------------------------------ provider setup

export async function upsertProvider(caller: Caller, name: string): Promise<ProviderRow> {
  if (!name.trim()) throw new UserError("Enter the clinic or hospital name.");
  const existing = (await db().from("providers").select("*").eq("user_id", caller.userId).maybeSingle()).data as ProviderRow | null;
  if (existing) {
    return must(await db().from("providers").update({ name: name.trim() }).eq("id", existing.id).select().single()) as ProviderRow;
  }
  const row = must(await db().from("providers").insert({ user_id: caller.userId, name: name.trim() }).select().single()) as ProviderRow;
  const wallet = await createWallet("provider", row.id);
  return must(
    await db().from("providers").update({ wallet_id: wallet.walletId, wallet_address: wallet.address }).eq("id", row.id).select().single(),
  ) as ProviderRow;
}

export type PriceItemInput = { code: string; label: string; unitPrice: bigint };

export async function savePriceList(provider: ProviderRow, items: PriceItemInput[]) {
  if (items.length === 0) throw new UserError("Add at least one item: a code, a label and a unit price.");
  for (const i of items) {
    if (!i.code.trim() || !i.label.trim()) throw new UserError("Every item needs a code and a label.");
    if (i.unitPrice <= 0n) throw new UserError(`${i.code}: the unit price must be more than zero.`);
  }
  const res = await db()
    .from("price_items")
    .upsert(
      items.map((i) => ({ provider_id: provider.id, code: i.code.trim(), label: i.label.trim(), unit_price_usdc: str(i.unitPrice), active: true })),
      { onConflict: "provider_id,code" },
    )
    .select();
  return must(res) as PriceItemRow[];
}

// ------------------------------------------------------------------ episodes

export type NewEpisode = {
  patientLabel: string;
  description: string;
  lines: { priceItemId: string; quantity: number }[];
  contingencyBps?: number;
  capBps?: number;
  coveredCodes: string[];
  coveredBps: number;
  isInternalTest: boolean;
};

/** Flow 1, steps 2–3: create from the quote; the agent sizes the guarantee and explains why. */
export async function createEpisode(provider: ProviderRow, input: NewEpisode) {
  if (!input.patientLabel.trim()) throw new UserError("Enter how to refer to the patient, e.g. “Maria L.”.");
  const items = must(
    await db().from("price_items").select("*").eq("provider_id", provider.id).in("id", input.lines.map((l) => l.priceItemId)),
  ) as PriceItemRow[];
  const lines: QuoteLine[] = input.lines.map((l) => {
    const item = items.find((i) => i.id === l.priceItemId);
    if (!item) throw new UserError("Every quote line must come from your price list.");
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new UserError(`${item.code}: quantity must be a whole number above zero.`);
    return { priceItemId: item.id, code: item.code, unitPrice: big(item.unit_price_usdc), quantity: l.quantity };
  });
  const unknownCodes = input.coveredCodes.filter((c) => !items.some((i) => i.code === c));
  if (unknownCodes.length) throw new UserError(`Covered codes not in this quote: ${unknownCodes.join(", ")}.`);

  const contingencyBps = input.contingencyBps ?? settings.contingencyBps;
  const capBps = input.capBps ?? settings.capBps;
  let sizing;
  try {
    sizing = sizeGuarantee({ lines, contingencyBps, capBps, coveredCodes: input.coveredCodes, coveredBps: input.coveredBps });
  } catch (err) {
    throw new UserError(err instanceof Error ? err.message : "Couldn't size this quote.");
  }

  const ep = must(
    await db()
      .from("episodes")
      .insert({
        provider_id: provider.id,
        network: config.network,
        patient_label: input.patientLabel.trim(),
        description: input.description.trim(),
        quote_usdc: str(sizing.quote),
        contingency_pct: contingencyBps / 100,
        guarantee_usdc: str(sizing.guarantee),
        per_charge_cap: str(sizing.perChargeCap),
        covered_codes: input.coveredCodes,
        covered_pct: input.coveredBps / 100,
        is_internal_test: input.isInternalTest,
      })
      .select()
      .single(),
  ) as EpisodeRow;
  must(await db().from("quote_items").insert(lines.map((l) => ({ episode_id: ep.id, price_item_id: l.priceItemId, quantity: l.quantity }))).select());

  // Logged onchain once the episode exists (addPayers).
  await decide(ep, { kind: "size", outcome: "sized", reason: sizing.reason, inputs: { lines, contingencyBps, capBps, sizing } });
  return { episode: ep, sizing };
}

export type PayerInput = { email: string; name: string; currency: Currency };

/** Flow 1, steps 2–5: add both payers, create their wallets, and create the episode onchain. */
export async function addPayers(provider: ProviderRow, episodeId: string, input: { coverer: PayerInput; family: PayerInput }) {
  const ep = await loadEpisode(episodeId);
  ownEpisode(provider, ep);
  if (ep.contract_episode_id !== null) throw new UserError("Payers are already set for this episode.", 409);
  for (const p of [input.coverer, input.family]) {
    if (!/^\S+@\S+\.\S+$/.test(p.email)) throw new UserError(`“${p.email}” isn't an email address.`);
    if (!p.name.trim()) throw new UserError("Enter a name for each payer.");
  }
  if (input.coverer.email.toLowerCase() === input.family.email.toLowerCase()) throw new UserError("Coverer and family need different emails.");
  if (!provider.wallet_address) throw new UserError("Your provider wallet isn't ready yet.", 409);

  const lines = await loadQuote(ep.id);
  // Only the coverer/family split is used here; the guarantee and cap were fixed at creation.
  const sizing = sizeGuarantee({
    lines,
    contingencyBps: Math.round(ep.contingency_pct * 100),
    capBps: settings.capBps,
    coveredCodes: ep.covered_codes,
    coveredBps: Math.round(ep.covered_pct * 100),
  });
  const owes = { coverer: sizing.covererOwes, family: sizing.familyOwes };

  // Re-running after a failure reuses rows and wallets already created.
  const existing = (must(await db().from("payers").select("*").eq("episode_id", ep.id)) as PayerRow[]) ?? [];
  const rows: Record<"coverer" | "family", PayerRow> = {} as never;
  for (const role of ["coverer", "family"] as const) {
    let row = existing.find((r) => r.role === role);
    if (!row) {
      row = must(
        await db()
          .from("payers")
          .insert({ episode_id: ep.id, role, email: input[role].email.trim(), display_name: input[role].name.trim(), currency: input[role].currency, owed_usdc: str(owes[role]) })
          .select()
          .single(),
      ) as PayerRow;
    }
    if (!row.wallet_address) {
      const w = await createWallet(role, row.id);
      row = must(await db().from("payers").update({ wallet_id: w.walletId, wallet_address: w.address }).eq("id", row.id).select().single()) as PayerRow;
    }
    rows[role] = row;
  }

  const expiresAt = (await chainNow()) + BigInt(settings.expirySeconds);
  const hash = await tracked({ episodeId: ep.id, kind: "create" }, () =>
    send(agentSigner(), {
      ...careGuard,
      functionName: "createEpisode",
      args: [
        provider.wallet_address as Address,
        rows.coverer.wallet_address as Address,
        rows.family.wallet_address as Address,
        big(ep.guarantee_usdc),
        big(ep.per_charge_cap),
        expiresAt,
      ],
    }),
  );
  const receipt = await publicClient.getTransactionReceipt({ hash });
  const [created] = parseEventLogs({ abi: careGuardAbi, eventName: "EpisodeCreated", logs: receipt.logs });
  if (!created) throw new UserError("The episode was created but its ID couldn't be read. Run the indexer to recover it.", 502);

  const updated = must(
    await db()
      .from("episodes")
      .update({ contract_episode_id: Number(created.args.episodeId), expires_at: new Date(Number(expiresAt) * 1000).toISOString(), status: "created" })
      .eq("id", ep.id)
      .select()
      .single(),
  ) as EpisodeRow;

  // Now that it exists onchain, log the sizing decision recorded at creation.
  const size = (await db().from("decisions").select("id, hash, tx_hash").eq("episode_id", ep.id).eq("kind", "size").maybeSingle()).data;
  if (size && !size.tx_hash) await logDecisionOnchain(updated, size.id, "size", size.hash as Hex);

  return { episode: updated, payers: rows, txHash: hash };
}

// ------------------------------------------------------------------ funding

/** Flow 2: a payer funds their share, in USDC or EURC (swapped to USDC first). */
export async function fund(caller: Caller, episodeId: string, input: { amount: bigint; currency: Currency }) {
  const ep = await loadEpisode(episodeId);
  const payer = await payerFor(caller, episodeId);
  if (!payer) throw new UserError("You're not a payer on this episode.", 403);
  const id = contractId(ep);
  if (input.amount <= 0n) throw new UserError("Enter an amount above zero.");
  const signer = signerOf(payer);

  let usdcAmount = input.amount;
  if (input.currency === "EURC") {
    await tracked({ episodeId, kind: "swap", payerId: payer.id, amount: input.amount, currency: "EURC" }, async () => {
      const r = await swapEurcToUsdc(signer, input.amount);
      usdcAmount = r.amountOut;
      return r.txHash;
    });
  }

  await tracked({ episodeId, kind: "fund", payerId: payer.id, amount: usdcAmount, currency: "USDC" }, async () => {
    await send(signer, { address: config.usdc, abi: erc20Abi, functionName: "approve", args: [careGuard.address, usdcAmount] });
    return send(signer, { ...careGuard, functionName: "fund", args: [id, usdcAmount] });
  });

  must(await db().from("payers").update({ funded_usdc: str(big(payer.funded_usdc) + usdcAmount) }).eq("id", payer.id).select().single());
  const fresh = await refreshFromChain(ep);

  // Charges that were waiting for this top-up get another review.
  const waiting = must(await db().from("charges").select("id").eq("episode_id", ep.id).eq("status", "waiting").order("number")) as { id: string }[];
  for (const w of waiting) await processCharge(w.id);

  return { episode: fresh, funded: usdcAmount };
}

// ------------------------------------------------------------------ charges

export type NewCharge = { priceItemId: string | null; description: string; quantity: number; amount: bigint | null };

/** Flow 3: the provider submits a charge; the agent decides within seconds. */
export async function submitCharge(provider: ProviderRow, episodeId: string, input: NewCharge) {
  const ep = await loadEpisode(episodeId);
  ownEpisode(provider, ep);
  contractId(ep);
  if (ep.status === "closed" || ep.status === "expired") throw new UserError("This episode is closed. Start a new one for further treatment.", 409);
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new UserError("Quantity must be a whole number above zero.");

  let item: PriceItemRow | null = null;
  if (input.priceItemId) {
    item = (await db().from("price_items").select("*").eq("id", input.priceItemId).eq("provider_id", provider.id).maybeSingle()).data as PriceItemRow | null;
    if (!item) throw new UserError("That price item isn't on your list.");
  }
  const amount = input.amount ?? (item ? big(item.unit_price_usdc) * BigInt(input.quantity) : null);
  if (amount === null || amount <= 0n) throw new UserError("Enter the amount for a charge that isn't on your price list.");

  const last = (await db().from("charges").select("number").eq("episode_id", ep.id).order("number", { ascending: false }).limit(1).maybeSingle()).data;
  const number = (last?.number ?? 0) + 1;
  const { salt, hash } = saltedHash({ episodeId: ep.id, number, priceItemId: input.priceItemId, quantity: input.quantity, amount });
  const charge = must(
    await db()
      .from("charges")
      .insert({ episode_id: ep.id, number, price_item_id: input.priceItemId, description: input.description.trim(), quantity: input.quantity, amount_usdc: str(amount), salt, hash })
      .select()
      .single(),
  ) as ChargeRow;

  return processCharge(charge.id);
}

async function chargeContext(charge: ChargeRow) {
  const ep = await loadEpisode(charge.episode_id);
  const [quote, chain, pastRows, item] = await Promise.all([
    loadQuote(ep.id),
    onchain(contractId(ep)),
    db().from("charges").select("price_item_id, quantity, amount_usdc, status").eq("episode_id", ep.id).neq("id", charge.id).order("number"),
    charge.price_item_id ? db().from("price_items").select("*").eq("id", charge.price_item_id).single() : Promise.resolve({ data: null }),
  ]);
  const past: PastCharge[] = ((pastRows.data ?? []) as Pick<ChargeRow, "price_item_id" | "quantity" | "amount_usdc" | "status">[]).map((c) => ({
    priceItemId: c.price_item_id,
    quantity: c.quantity,
    amount: big(c.amount_usdc),
    status: c.status,
  }));
  const state: EpisodeState = {
    perChargeCap: chain.perChargeCap,
    covererBalance: chain.covererBalance,
    familyBalance: chain.familyBalance,
    coveredCodes: ep.covered_codes,
    coveredBps: Math.round(ep.covered_pct * 100),
    quote,
    past,
  };
  const p = item.data as PriceItemRow | null;
  return { ep, state, priceItem: p ? { id: p.id, code: p.code, label: p.label, unitPrice: big(p.unit_price_usdc) } : null };
}

/** Reviews a waiting charge and acts on the decision. Safe to call again on a charge still waiting. */
export async function processCharge(chargeId: string) {
  const charge = must(await db().from("charges").select("*").eq("id", chargeId).single()) as ChargeRow;
  if (charge.status !== "waiting") return { charge, decision: null };
  const { ep, state, priceItem } = await chargeContext(charge);
  const amount = big(charge.amount_usdc);

  const outcome = await reviewCharge(state, { number: charge.number, priceItem, quantity: charge.quantity, amount, description: charge.description }, chargeJudge());
  const inputs = { charge: { number: charge.number, priceItemId: charge.price_item_id, quantity: charge.quantity, amount, description: charge.description }, state, outcome };

  if (outcome.decision === "escalate") {
    const d = await decide(ep, { kind: "escalate", outcome: "escalate", reason: outcome.reason, inputs, chargeId });
    const updated = must(await db().from("charges").update({ status: "escalated", covered_usdc: str(outcome.covered) }).eq("id", chargeId).select().single()) as ChargeRow;
    return { charge: updated, decision: { ...d, outcome: "escalate", reason: outcome.reason } };
  }

  if (outcome.decision === "margin_call") {
    const d = await decide(ep, { kind: "margin_call", outcome: "margin_call", reason: outcome.reason, inputs, chargeId });
    await raiseMarginCalls(ep, outcome.calls, d.hash);
    await refreshFromChain(ep);
    const updated = must(await db().from("charges").update({ covered_usdc: str(outcome.covered) }).eq("id", chargeId).select().single()) as ChargeRow;
    return { charge: updated, decision: { ...d, outcome: "margin_call", reason: outcome.reason } };
  }

  const d = await decide(ep, { kind: "review", outcome: "pay", reason: outcome.reason, inputs, chargeId });
  const updated = await payOnchain(ep, charge, outcome.covered, null);
  await afterPayment(ep);
  return { charge: updated, decision: { ...d, outcome: "pay", reason: outcome.reason } };
}

async function payOnchain(ep: EpisodeRow, charge: ChargeRow, covered: bigint, approval: { deadline: bigint; signature: Hex } | null) {
  const amount = big(charge.amount_usdc);
  const txHash = await tracked({ episodeId: ep.id, kind: "charge", amount, currency: "USDC" }, () =>
    approval
      ? send(agentSigner(), {
          ...careGuard,
          functionName: "payChargeApproved",
          args: [contractId(ep), charge.hash as Hex, amount, covered, approval.deadline, approval.signature],
        })
      : send(agentSigner(), { ...careGuard, functionName: "payCharge", args: [contractId(ep), charge.hash as Hex, amount, covered] }),
  );
  return must(
    await db().from("charges").update({ status: "paid", covered_usdc: str(covered), tx_hash: txHash }).eq("id", charge.id).select().single(),
  ) as ChargeRow;
}

async function raiseMarginCalls(ep: EpisodeRow, calls: { role: "coverer" | "family"; amount: bigint }[], reasonHash: Hex) {
  const payers = await loadPayers(ep.id);
  for (const c of calls) {
    await tracked({ episodeId: ep.id, kind: "margin_call", payerId: payers[c.role].id, amount: c.amount, currency: "USDC" }, () =>
      send(agentSigner(), {
        ...careGuard,
        functionName: "raiseMarginCall",
        args: [contractId(ep), payers[c.role].wallet_address as Address, c.amount, reasonHash],
      }),
    );
  }
}

/** After each payment: if funds left won't cover the expected remaining cost, ask the short payer to top up. */
async function afterPayment(ep: EpisodeRow) {
  const fresh = await refreshFromChain(ep);
  const quote = await loadQuote(ep.id);
  const past = ((must(await db().from("charges").select("price_item_id, quantity, amount_usdc, status").eq("episode_id", ep.id)) as ChargeRow[]) ?? []).map((c) => ({
    priceItemId: c.price_item_id,
    quantity: c.quantity,
    amount: big(c.amount_usdc),
    status: c.status,
  }));
  const calls = marginCallsNeeded({
    quote,
    past,
    coveredCodes: ep.covered_codes,
    coveredBps: Math.round(ep.covered_pct * 100),
    covererBalance: big(fresh.coverer_balance),
    familyBalance: big(fresh.family_balance),
  });
  if (calls.length === 0 || fresh.status === "margin_call") return;
  const reason = calls
    .map((c) => `Expected remaining cost leaves the ${roleLabel(c.role)} share ${formatAmount(c.amount)} USDC short.`)
    .join(" ") + " Asking for a top-up before funds run out.";
  const d = await decide(fresh, { kind: "margin_call", outcome: "margin_call", reason, inputs: { quote, past, calls } });
  await raiseMarginCalls(fresh, calls, d.hash);
  await refreshFromChain(fresh);
}

// ------------------------------------------------------------------ approvals (Flow 4)

/** The exact message the approver signs, and the sentence that says what signing does. */
async function approvalRequest(charge: ChargeRow, ep: EpisodeRow) {
  const provider = await providerOf(ep);
  const amount = big(charge.amount_usdc);
  const covered = big(charge.covered_usdc);
  const deadline = (await chainNow()) + BigInt(settings.approvalTtlSeconds);
  return {
    domain: eip712Domain,
    types: approveChargeTypes,
    primaryType: "ApproveCharge" as const,
    message: { episodeId: contractId(ep), chargeHash: charge.hash as Hex, amount, coveredAmount: covered, deadline },
    consequence: `Approve charge #${charge.number}: pay ${provider.name} ${formatAmount(amount)} USDC, ${formatAmount(covered)} from the coverer and ${formatAmount(amount - covered)} from family.`,
  };
}

export async function listApprovals() {
  const rows = must(
    await db().from("charges").select("*, episodes(*), decisions(reason, created_at, kind)").eq("status", "escalated").order("created_at"),
  ) as (ChargeRow & { episodes: EpisodeRow; decisions: { reason: string; created_at: string; kind: string }[] })[];
  return Promise.all(
    rows.map(async (r) => {
      const { episodes: ep, decisions, ...charge } = r;
      const reason = decisions.filter((d) => d.kind === "escalate").sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.reason ?? "";
      return { charge, episode: { id: ep.id, contractEpisodeId: ep.contract_episode_id, patientLabel: ep.patient_label }, reason, request: await approvalRequest(charge, ep) };
    }),
  );
}

export async function approveCharge(chargeId: string, input: { deadline: bigint; signature: Hex }) {
  const charge = must(await db().from("charges").select("*").eq("id", chargeId).maybeSingle(), "Charge not found.") as ChargeRow;
  if (charge.status !== "escalated") throw new UserError(`Charge #${charge.number} isn't waiting for approval.`, 409);
  const ep = await loadEpisode(charge.episode_id);
  const covered = big(charge.covered_usdc);
  const amount = big(charge.amount_usdc);

  // Check the signature here first, so a wrong key fails with a clear message before any transaction.
  const approver = await publicClient.readContract({ ...careGuard, functionName: "approver" });
  const valid = await publicClient.verifyTypedData({
    address: approver,
    domain: eip712Domain,
    types: approveChargeTypes,
    primaryType: "ApproveCharge",
    message: { episodeId: contractId(ep), chargeHash: charge.hash as Hex, amount, coveredAmount: covered, deadline: input.deadline },
    signature: input.signature,
  });
  if (!valid) throw new UserError("That signature isn't from the approver key for this charge. Sign again with the approver wallet.", 403);

  const reason = `Approver approved #${charge.number}, ${formatAmount(amount)}.`;
  await decide(ep, { kind: "escalate", outcome: "approve", reason, inputs: { chargeId, deadline: input.deadline }, chargeId, verdict: "approved" });
  const updated = await payOnchain(ep, charge, covered, input);
  await afterPayment(ep);
  return updated;
}

export async function rejectCharge(chargeId: string, reasonText: string) {
  if (!reasonText.trim()) throw new UserError("Give a one-line reason so the provider knows why.");
  const charge = must(await db().from("charges").select("*").eq("id", chargeId).maybeSingle(), "Charge not found.") as ChargeRow;
  if (charge.status !== "escalated") throw new UserError(`Charge #${charge.number} isn't waiting for approval.`, 409);
  const ep = await loadEpisode(charge.episode_id);
  const reason = `Approver rejected #${charge.number}: ${reasonText.trim()}`;
  await decide(ep, { kind: "escalate", outcome: "reject", reason, inputs: { chargeId }, chargeId, verdict: "rejected" });
  return must(await db().from("charges").update({ status: "rejected", reject_reason: reasonText.trim() }).eq("id", chargeId).select().single()) as ChargeRow;
}

// ------------------------------------------------------------------ discharge and refunds (Flows 5, 6)

export async function discharge(provider: ProviderRow, episodeId: string) {
  const ep = await loadEpisode(episodeId);
  ownEpisode(provider, ep);
  const chain = await onchain(contractId(ep));
  const reason = `Discharged. Returning ${formatAmount(chain.covererBalance)} to the coverer and ${formatAmount(chain.familyBalance)} to family.`;
  await decide(ep, { kind: "discharge", outcome: "discharge", reason, inputs: { paidTotal: chain.paidTotal, covererBalance: chain.covererBalance, familyBalance: chain.familyBalance } });
  const txHash = await tracked({ episodeId: ep.id, kind: "refund", amount: chain.covererBalance + chain.familyBalance, currency: "USDC" }, () =>
    send(agentSigner(), { ...careGuard, functionName: "discharge", args: [contractId(ep)] }),
  );
  await db().from("charges").update({ status: "rejected", reject_reason: "Episode discharged before approval." }).eq("episode_id", ep.id).in("status", ["waiting", "escalated"]);
  return { episode: await refreshFromChain(ep), txHash };
}

/** Anyone can trigger this after expiry; our agent pays the gas. Payers can also call it from the explorer. */
export async function refundExpired(episodeId: string) {
  const ep = await loadEpisode(episodeId);
  const chain = await onchain(contractId(ep));
  if ((await chainNow()) < BigInt(chain.expiresAt)) {
    throw new UserError(`This episode doesn't expire until ${new Date(Number(chain.expiresAt) * 1000).toUTCString()}.`, 409);
  }
  const txHash = await tracked({ episodeId: ep.id, kind: "refund", amount: chain.covererBalance + chain.familyBalance, currency: "USDC" }, () =>
    send(agentSigner(), { ...careGuard, functionName: "refundExpired", args: [contractId(ep)] }),
  );
  return { episode: await refreshFromChain(ep), txHash };
}

// ------------------------------------------------------------------ reads

/** An episode with balances, charges and decisions, cut down to what the caller's role may see. */
export async function episodeView(episodeId: string, access: { provider: boolean; approver: boolean; payer: PayerRow | null }) {
  const ep = await refreshFromChain(await loadEpisode(episodeId));
  const full = access.provider || access.approver;
  const [payers, charges, decisions, transactions, quote] = await Promise.all([
    db().from("payers").select("id, role, display_name, email, currency, wallet_address, owed_usdc, funded_usdc").eq("episode_id", ep.id),
    full
      ? db().from("charges").select("*, price_items(code, label)").eq("episode_id", ep.id).order("number")
      : db().from("charges").select("id, number, quantity, amount_usdc, covered_usdc, status, tx_hash, created_at, price_items(label)").eq("episode_id", ep.id).order("number"),
    db().from("decisions").select(full ? "*" : "id, kind, outcome, reason, hash, tx_hash, created_at, charge_id").eq("episode_id", ep.id).order("created_at"),
    db().from("transactions").select("*").eq("episode_id", ep.id).order("created_at"),
    full ? loadQuote(ep.id) : Promise.resolve(null),
  ]);
  const episode = full ? ep : { ...ep, description: undefined };
  return {
    episode,
    role: access.provider ? "provider" : access.approver ? "approver" : "payer",
    me: access.payer ? { id: access.payer.id, role: access.payer.role } : null,
    payers: payers.data ?? [],
    charges: charges.data ?? [],
    decisions: decisions.data ?? [],
    transactions: transactions.data ?? [],
    quote,
    explorerUrl: config.explorerUrl,
  };
}

/** Real counts and volumes for the submission form; internal test episodes excluded. */
export async function traction() {
  const eps = must(await db().from("episodes").select("id, network, provider_id, paid_total, status").eq("is_internal_test", false)) as Pick<
    EpisodeRow,
    "id" | "network" | "provider_id" | "paid_total" | "status"
  >[];
  const ids = eps.map((e) => e.id);
  const [charges, payers, funds] = await Promise.all([
    ids.length ? db().from("charges").select("episode_id, amount_usdc").eq("status", "paid").in("episode_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? db().from("payers").select("episode_id, user_id").in("episode_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? db().from("transactions").select("episode_id, amount, network").eq("kind", "fund").eq("status", "confirmed").in("episode_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const byNetwork = (network: string) => {
    const e = eps.filter((x) => x.network === network);
    const set = new Set(e.map((x) => x.id));
    const paid = (charges.data ?? []).filter((c: { episode_id: string }) => set.has(c.episode_id));
    const funded = (funds.data ?? []).filter((t: { episode_id: string }) => set.has(t.episode_id));
    return {
      providers: new Set(e.map((x) => x.provider_id)).size,
      episodes: e.length,
      payers: (payers.data ?? []).filter((p: { episode_id: string }) => set.has(p.episode_id)).length,
      chargesPaid: paid.length,
      paidVolumeUsdc: formatAmount(paid.reduce((s: bigint, c: { amount_usdc: number }) => s + big(c.amount_usdc), 0n)),
      fundedVolumeUsdc: formatAmount(funded.reduce((s: bigint, t: { amount: number }) => s + big(t.amount), 0n)),
    };
  };
  return { testnet: byNetwork("testnet"), mainnet: byNetwork("mainnet") };
}
