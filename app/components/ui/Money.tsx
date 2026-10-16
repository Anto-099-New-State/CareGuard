import { formatAmount, type Currency } from "@/lib/money";

/** Base-unit amount (bigint, or the number/string the API returns) as `125.00 USDC`, in the mono face. */
export function Money({ value, currency = "USDC", className = "" }: { value: bigint | number | string | null | undefined; currency?: Currency; className?: string }) {
  const units = value === null || value === undefined ? 0n : BigInt(String(value));
  return (
    <span className={`font-mono whitespace-nowrap tabular-nums ${className}`}>
      {formatAmount(units)} <span className="text-[0.85em] text-muted">{currency}</span>
    </span>
  );
}

export const toUnits = (v: bigint | number | string | null | undefined) => (v === null || v === undefined ? 0n : BigInt(String(v)));
