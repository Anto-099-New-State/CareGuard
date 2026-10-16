import { formatAmount } from "../money";
import { coveredPart, lineTotal, type QuoteLine } from "./sizing";

export type PriceItem = { id: string; code: string; label: string; unitPrice: bigint };

export type PastCharge = { priceItemId: string | null; quantity: number; amount: bigint; status: "waiting" | "paid" | "escalated" | "rejected" };

export type EpisodeState = {
  perChargeCap: bigint;
  covererBalance: bigint;
  familyBalance: bigint;
  coveredCodes: string[];
  coveredBps: number;
  quote: QuoteLine[];
  /** Charges already submitted on this episode, oldest first. */
  past: PastCharge[];
};

export type ChargeRequest = {
  number: number;
  priceItem: PriceItem | null;
  quantity: number;
  amount: bigint;
  /** Free text from the provider. Shown to the LLM, never written into a decision reason. */
  description: string;
};

/** What the LLM is asked to judge once every deterministic check has passed. */
export type JudgeInput = {
  charge: { number: number; code: string; label: string; quantity: number; amount: string; description: string };
  proposedCovered: string;
  coverage: { coveredCodes: string[]; coveredPct: number };
  quote: { code: string; quantity: number; unitPrice: string }[];
  history: { code: string | null; quantity: number; amount: string; status: string }[];
};

export type JudgeVerdict = { verdict: "pay" | "escalate"; coveredAmount: string; reason: string };
export type ChargeJudge = (input: JudgeInput) => Promise<JudgeVerdict>;

export type ReviewOutcome =
  | { decision: "pay"; covered: bigint; reason: string; checks: string[] }
  | { decision: "escalate"; covered: bigint; reason: string; checks: string[] }
  | { decision: "margin_call"; covered: bigint; reason: string; checks: string[]; calls: MarginCallNeed[] };

export type MarginCallNeed = { role: "coverer" | "family"; amount: bigint };

const fmt = formatAmount;

/** Units of a price item already charged (paid, escalated or waiting) on the episode. */
function chargedUnits(past: PastCharge[], priceItemId: string) {
  return past.filter((c) => c.priceItemId === priceItemId && c.status !== "rejected").reduce((n, c) => n + c.quantity, 0);
}

/**
 * Reviews one charge. Deterministic checks run first (price list, price, quote, cap, duplicates, funds);
 * the LLM only judges charges that pass all of them. If the LLM and the checks disagree, we escalate.
 */
export async function reviewCharge(ep: EpisodeState, charge: ChargeRequest, judge: ChargeJudge | null): Promise<ReviewOutcome> {
  const item = charge.priceItem;
  const covered = coveredPart(charge.amount, item?.code ?? null, ep.coveredCodes, ep.coveredBps);
  const family = charge.amount - covered;
  const problems: string[] = [];

  if (charge.amount <= 0n || charge.quantity <= 0) throw new Error("A charge needs a positive amount and quantity.");

  if (!item) {
    problems.push("Not on the provider's price list.");
  } else {
    const expected = lineTotal({ unitPrice: item.unitPrice, quantity: charge.quantity });
    if (charge.amount !== expected) {
      problems.push(`Amount differs from the price list (${item.code}: ${charge.quantity} × ${fmt(item.unitPrice)} = ${fmt(expected)}).`);
    }
    const quoted = ep.quote.find((l) => l.priceItemId === item.id)?.quantity ?? 0;
    const already = chargedUnits(ep.past, item.id);
    if (quoted === 0) {
      problems.push("Not in the quote.");
    } else if (already + charge.quantity > quoted) {
      // Charging more units than quoted is what a duplicate looks like.
      problems.push(already > 0 ? `Possible duplicate: ${already} of ${quoted} quoted ${item.code} already charged.` : `More ${item.code} than quoted (${quoted}).`);
    }
  }

  if (charge.amount > ep.perChargeCap) {
    problems.unshift(`Above the ${fmt(ep.perChargeCap)} per-charge cap.`);
  }

  if (problems.length > 0) {
    return { decision: "escalate", covered, reason: problems.join(" "), checks: problems };
  }

  // Funds: each payer only pays their own share; one payer's money never covers the other's.
  const calls: MarginCallNeed[] = [];
  if (covered > ep.covererBalance) calls.push({ role: "coverer", amount: covered - ep.covererBalance });
  if (family > ep.familyBalance) calls.push({ role: "family", amount: family - ep.familyBalance });
  if (calls.length > 0) {
    const parts = calls.map((c) => `${c.role === "coverer" ? "Coverer" : "Family"} balance is ${fmt(c.amount)} USDC short of this charge.`);
    return { decision: "margin_call", covered, reason: `${parts.join(" ")} Charge waits for a top-up.`, checks: parts, calls };
  }

  // Every check passed. The LLM looks for anything unusual and confirms the split.
  const base = `On price list (${item!.code}). ${fmt(covered)} covered, ${fmt(family)} family.`;
  if (!judge) {
    return { decision: "escalate", covered, reason: `${base} Agent review is unavailable, so a human will check it.`, checks: ["no judge"] };
  }

  let verdict: JudgeVerdict;
  try {
    verdict = await judge({
      charge: { number: charge.number, code: item!.code, label: item!.label, quantity: charge.quantity, amount: fmt(charge.amount), description: charge.description },
      proposedCovered: fmt(covered),
      coverage: { coveredCodes: ep.coveredCodes, coveredPct: ep.coveredBps / 100 },
      quote: ep.quote.map((l) => ({ code: l.code, quantity: l.quantity, unitPrice: fmt(l.unitPrice) })),
      history: ep.past.map((c) => ({ code: ep.quote.find((l) => l.priceItemId === c.priceItemId)?.code ?? null, quantity: c.quantity, amount: fmt(c.amount), status: c.status })),
    });
  } catch {
    return { decision: "escalate", covered, reason: `${base} Agent review failed, so a human will check it.`, checks: ["judge error"] };
  }

  const agreesOnSplit = verdict.coveredAmount.replace(/,/g, "") === fmt(covered).replace(/,/g, "");
  if (verdict.verdict === "escalate") {
    return { decision: "escalate", covered, reason: verdict.reason, checks: ["judge escalated"] };
  }
  if (!agreesOnSplit) {
    return {
      decision: "escalate",
      covered,
      reason: `Agent and checks disagree on the covered part (${verdict.coveredAmount} vs ${fmt(covered)}).`,
      checks: ["split disagreement"],
    };
  }
  return { decision: "pay", covered, reason: `${base} ${verdict.reason}`.trim(), checks: [] };
}

/**
 * Expected cost still to come: quoted units not yet charged, priced from the quote, split by coverage.
 * Used after each payment to decide whether to raise a margin call before funds actually run out.
 */
export function expectedRemaining(ep: Pick<EpisodeState, "quote" | "past" | "coveredCodes" | "coveredBps">) {
  let coverer = 0n;
  let family = 0n;
  for (const line of ep.quote) {
    const left = Math.max(0, line.quantity - chargedUnits(ep.past.filter((c) => c.status === "paid"), line.priceItemId));
    const amount = lineTotal({ unitPrice: line.unitPrice, quantity: left });
    const c = coveredPart(amount, line.code, ep.coveredCodes, ep.coveredBps);
    coverer += c;
    family += amount - c;
  }
  return { coverer, family };
}

/** Margin calls needed so remaining funds cover the expected remaining cost, per payer. */
export function marginCallsNeeded(ep: Pick<EpisodeState, "quote" | "past" | "coveredCodes" | "coveredBps" | "covererBalance" | "familyBalance">): MarginCallNeed[] {
  const need = expectedRemaining(ep);
  const calls: MarginCallNeed[] = [];
  if (need.coverer > ep.covererBalance) calls.push({ role: "coverer", amount: need.coverer - ep.covererBalance });
  if (need.family > ep.familyBalance) calls.push({ role: "family", amount: need.family - ep.familyBalance });
  return calls;
}
