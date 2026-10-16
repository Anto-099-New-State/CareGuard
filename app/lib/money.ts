// USDC and EURC on Arc both use 6 decimals. Compute with bigint only; format at the edge.
export const DECIMALS = 6;
const UNIT = 10n ** BigInt(DECIMALS);

export type Currency = "USDC" | "EURC";

/** "125.5" -> 125500000n. Throws on more than 6 decimals or a malformed amount. */
export function parseAmount(value: string): bigint {
  const trimmed = value.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`"${value}" is not an amount. Use digits and an optional decimal point, like 125.00.`);
  }
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > DECIMALS) {
    throw new Error(`"${value}" has more than ${DECIMALS} decimal places.`);
  }
  return BigInt(whole) * UNIT + BigInt(frac.padEnd(DECIMALS, "0"));
}

/** 125500000n -> "125.50", with thousands separators and two decimals. */
export function formatAmount(units: bigint): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / UNIT;
  // Round half up to cents.
  const cents = ((abs % UNIT) + 5_000n) / 10_000n;
  const carry = cents === 100n ? 1n : 0n;
  const wholeStr = (whole + carry).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const centsStr = (carry ? 0n : cents).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${wholeStr}.${centsStr}`;
}

/** 125500000n -> "125.50 USDC" — the one way amounts appear in the UI. */
export function formatMoney(units: bigint, currency: Currency = "USDC"): string {
  return `${formatAmount(units)} ${currency}`;
}
