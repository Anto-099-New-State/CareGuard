import { formatAmount, type Currency } from "@/lib/money";

export const toUnits = (v: bigint | number | string | null | undefined) => (v === null || v === undefined ? 0n : BigInt(String(v)));

/**
 * Base-unit amount (bigint, or the number/string the API returns) as `125.00 USDC`:
 * aligned digits in the interface face, the currency as a quiet suffix. `display` uses the heading face for hero numbers.
 */
export function Money({
  value,
  currency = "USDC",
  display = false,
  className = "",
}: {
  value: bigint | number | string | null | undefined;
  currency?: Currency;
  display?: boolean;
  className?: string;
}) {
  return (
    <span className={`amount ${display ? "font-display tracking-[-0.02em]" : ""} ${className}`}>
      {formatAmount(toUnits(value))}
      <span className="ccy">{currency}</span>
    </span>
  );
}
