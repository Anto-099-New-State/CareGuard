import { formatAmount } from "../money";

export type QuoteLine = { priceItemId: string; code: string; unitPrice: bigint; quantity: number };

export type SizingInput = {
  lines: QuoteLine[];
  /** Contingency on top of the quote, in basis points (2000 = 20%). */
  contingencyBps: number;
  /** Per-charge cap as a share of the guarantee, in basis points (2500 = 25%). */
  capBps: number;
  /** Codes the coverer pays for, and what share of each, in basis points. */
  coveredCodes: string[];
  coveredBps: number;
};

export type Sizing = {
  quote: bigint;
  guarantee: bigint;
  perChargeCap: bigint;
  /** What each payer is asked to fund, summing to the guarantee. */
  covererOwes: bigint;
  familyOwes: bigint;
  reason: string;
};

const CENT = 10_000n; // 0.01 USDC in base units
const ceilToCent = (v: bigint) => ((v + CENT - 1n) / CENT) * CENT;
const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;

export const lineTotal = (l: Pick<QuoteLine, "unitPrice" | "quantity">) => l.unitPrice * BigInt(l.quantity);

/** Covered part of an amount for a price item code: the covered share if the code is covered, else nothing. */
export function coveredPart(amount: bigint, code: string | null, coveredCodes: string[], coveredBps: number): bigint {
  if (!code || !coveredCodes.includes(code)) return 0n;
  return (amount * BigInt(coveredBps)) / 10_000n;
}

/**
 * Sizes the guarantee from the provider's own quote plus a stated contingency.
 * We have no cost history yet, so this is deliberately simple and explainable.
 */
export function sizeGuarantee(input: SizingInput): Sizing {
  if (input.lines.length === 0) throw new Error("A quote needs at least one line from the price list.");
  if (input.contingencyBps < 0 || input.contingencyBps > 10_000) throw new Error("Contingency must be between 0% and 100%.");
  if (input.capBps <= 0 || input.capBps > 10_000) throw new Error("Per-charge cap must be between 0% and 100% of the guarantee.");

  const quote = input.lines.reduce((sum, l) => sum + lineTotal(l), 0n);
  const guarantee = ceilToCent((quote * BigInt(10_000 + input.contingencyBps)) / 10_000n);
  const perChargeCap = ceilToCent((guarantee * BigInt(input.capBps)) / 10_000n);

  // Split the guarantee in the same proportion as the quote's covered and non-covered parts.
  const coveredQuote = input.lines.reduce(
    (sum, l) => sum + coveredPart(lineTotal(l), l.code, input.coveredCodes, input.coveredBps),
    0n,
  );
  const covererOwes = quote === 0n ? 0n : ceilToCent((guarantee * coveredQuote) / quote);
  const familyOwes = guarantee - covererOwes;

  const reason =
    `Quote ${formatAmount(quote)} + ${pct(input.contingencyBps)} contingency. No cost history yet. ` +
    `Per-charge cap ${formatAmount(perChargeCap)} (${pct(input.capBps)} of the guarantee).`;

  return { quote, guarantee, perChargeCap: perChargeCap > guarantee ? guarantee : perChargeCap, covererOwes, familyOwes, reason };
}
