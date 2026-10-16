import { describe, expect, it } from "vitest";
import { formatAmount, formatMoney, parseAmount } from "./money";

describe("money", () => {
  it("parses to 6-decimal base units", () => {
    expect(parseAmount("125")).toBe(125_000_000n);
    expect(parseAmount("125.5")).toBe(125_500_000n);
    expect(parseAmount("1,800.00")).toBe(1_800_000_000n);
    expect(parseAmount("0.000001")).toBe(1n);
  });

  it("rejects malformed amounts and too many decimals", () => {
    expect(() => parseAmount("12a")).toThrow(/not an amount/);
    expect(() => parseAmount("-1")).toThrow(/not an amount/);
    expect(() => parseAmount("1.0000001")).toThrow(/decimal places/);
  });

  it("formats with separators and two decimals", () => {
    expect(formatAmount(1_800_000_000n)).toBe("1,800.00");
    expect(formatAmount(1_995_000n)).toBe("2.00");
    expect(formatAmount(1_994_999n)).toBe("1.99");
    expect(formatMoney(125_000_000n)).toBe("125.00 USDC");
    expect(formatMoney(120_000_000n, "EURC")).toBe("120.00 EURC");
  });
});
