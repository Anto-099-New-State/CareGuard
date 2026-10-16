import { describe, expect, it, vi } from "vitest";
import { parseAmount as u } from "../money";
import { marginCallsNeeded, reviewCharge, type ChargeJudge, type EpisodeState, type PriceItem } from "./review";
import { sizeGuarantee, type QuoteLine } from "./sizing";

// Fixtures for these unit tests only; never shown in the app.
const consult: PriceItem = { id: "p1", code: "CON-01", label: "Consultation", unitPrice: u("80") };
const implant: PriceItem = { id: "p2", code: "IMP-01", label: "Implant surgery", unitPrice: u("300") };
const graft: PriceItem = { id: "p3", code: "GRF-01", label: "Bone graft", unitPrice: u("520") };
const quote: QuoteLine[] = [
  { priceItemId: "p1", code: "CON-01", unitPrice: u("80"), quantity: 1 },
  { priceItemId: "p2", code: "IMP-01", unitPrice: u("300"), quantity: 2 },
];

const state = (over: Partial<EpisodeState> = {}): EpisodeState => ({
  perChargeCap: u("450"),
  covererBalance: u("1000"),
  familyBalance: u("500"),
  coveredCodes: ["IMP-01"],
  coveredBps: 7000,
  quote,
  past: [],
  ...over,
});

const okJudge: ChargeJudge = async (i) => ({ verdict: "pay", coveredAmount: i.proposedCovered, reason: "Matches the quote." });

describe("sizeGuarantee", () => {
  it("adds contingency to the quote and splits by coverage", () => {
    const s = sizeGuarantee({ lines: quote, contingencyBps: 2000, capBps: 2500, coveredCodes: ["IMP-01"], coveredBps: 7000 });
    expect(s.quote).toBe(u("680"));
    expect(s.guarantee).toBe(u("816"));
    expect(s.perChargeCap).toBe(u("204"));
    // Covered quote = 600 × 70% = 420 of 680 → 504.00 of 816.00
    expect(s.covererOwes).toBe(u("504"));
    expect(s.covererOwes + s.familyOwes).toBe(s.guarantee);
    expect(s.reason).toBe("Quote 680.00 + 20% contingency. No cost history yet. Per-charge cap 204.00 (25% of the guarantee).");
  });

  it("rounds up to the cent", () => {
    const s = sizeGuarantee({ lines: [{ priceItemId: "x", code: "X", unitPrice: 1_000_001n, quantity: 1 }], contingencyBps: 1000, capBps: 3333, coveredCodes: [], coveredBps: 0 });
    expect(s.guarantee % 10_000n).toBe(0n);
    expect(s.guarantee).toBeGreaterThanOrEqual(1_100_001n);
  });

  it("rejects an empty quote and bad percentages", () => {
    expect(() => sizeGuarantee({ lines: [], contingencyBps: 0, capBps: 2500, coveredCodes: [], coveredBps: 0 })).toThrow(/at least one line/);
    expect(() => sizeGuarantee({ lines: quote, contingencyBps: -1, capBps: 2500, coveredCodes: [], coveredBps: 0 })).toThrow(/Contingency/);
    expect(() => sizeGuarantee({ lines: quote, contingencyBps: 0, capBps: 0, coveredCodes: [], coveredBps: 0 })).toThrow(/cap/);
  });
});

describe("reviewCharge", () => {
  it("pays a charge on the list, in the quote, under the cap, with the covered split", async () => {
    const r = await reviewCharge(state(), { number: 3, priceItem: implant, quantity: 1, amount: u("300"), description: "x" }, okJudge);
    expect(r.decision).toBe("pay");
    expect(r.covered).toBe(u("210"));
    expect(r.reason).toBe("On price list (IMP-01). 210.00 covered, 90.00 family. Matches the quote.");
  });

  it("puts uncovered items on the family", async () => {
    const r = await reviewCharge(state(), { number: 1, priceItem: consult, quantity: 1, amount: u("80"), description: "" }, okJudge);
    expect(r.decision).toBe("pay");
    expect(r.covered).toBe(0n);
  });

  it("escalates over the cap and not in the quote, without asking the LLM", async () => {
    const judge = vi.fn(okJudge);
    const r = await reviewCharge(state(), { number: 4, priceItem: graft, quantity: 1, amount: u("520"), description: "" }, judge);
    expect(r.decision).toBe("escalate");
    expect(r.reason).toBe("Above the 450.00 per-charge cap. Not in the quote.");
    expect(judge).not.toHaveBeenCalled();
  });

  it("escalates a charge that is off the price list", async () => {
    const r = await reviewCharge(state(), { number: 1, priceItem: null, quantity: 1, amount: u("50"), description: "" }, okJudge);
    expect(r).toMatchObject({ decision: "escalate", reason: "Not on the provider's price list." });
  });

  it("escalates a price that differs from the list", async () => {
    const r = await reviewCharge(state(), { number: 1, priceItem: consult, quantity: 1, amount: u("95"), description: "" }, okJudge);
    expect(r.decision).toBe("escalate");
    expect(r.reason).toMatch(/differs from the price list/);
  });

  it("escalates a possible duplicate beyond the quoted quantity", async () => {
    const past = [{ priceItemId: "p1", quantity: 1, amount: u("80"), status: "paid" as const }];
    const r = await reviewCharge(state({ past }), { number: 2, priceItem: consult, quantity: 1, amount: u("80"), description: "" }, okJudge);
    expect(r.decision).toBe("escalate");
    expect(r.reason).toBe("Possible duplicate: 1 of 1 quoted CON-01 already charged.");
  });

  it("ignores rejected charges when counting units", async () => {
    const past = [{ priceItemId: "p1", quantity: 1, amount: u("80"), status: "rejected" as const }];
    const r = await reviewCharge(state({ past }), { number: 2, priceItem: consult, quantity: 1, amount: u("80"), description: "" }, okJudge);
    expect(r.decision).toBe("pay");
  });

  it("raises a margin call for the payer who is short, never shifting shares", async () => {
    const r = await reviewCharge(state({ familyBalance: u("40") }), { number: 1, priceItem: implant, quantity: 1, amount: u("300"), description: "" }, okJudge);
    expect(r.decision).toBe("margin_call");
    if (r.decision !== "margin_call") throw new Error("expected margin call");
    expect(r.calls).toEqual([{ role: "family", amount: u("50") }]);
    expect(r.reason).toBe("Family balance is 50.00 USDC short of this charge. Charge waits for a top-up.");
  });

  it("escalates when the LLM escalates", async () => {
    const judge: ChargeJudge = async (i) => ({ verdict: "escalate", coveredAmount: i.proposedCovered, reason: "Description does not match IMP-01." });
    const r = await reviewCharge(state(), { number: 1, priceItem: implant, quantity: 1, amount: u("300"), description: "x" }, judge);
    expect(r).toMatchObject({ decision: "escalate", reason: "Description does not match IMP-01." });
  });

  it("escalates when the LLM disagrees with the covered split", async () => {
    const judge: ChargeJudge = async () => ({ verdict: "pay", coveredAmount: "300.00", reason: "ok" });
    const r = await reviewCharge(state(), { number: 1, priceItem: implant, quantity: 1, amount: u("300"), description: "x" }, judge);
    expect(r.decision).toBe("escalate");
    expect(r.reason).toMatch(/disagree/);
  });

  it("escalates when the LLM fails or is unavailable", async () => {
    const boom: ChargeJudge = async () => {
      throw new Error("down");
    };
    const charge = { number: 1, priceItem: implant, quantity: 1, amount: u("300"), description: "" };
    expect((await reviewCharge(state(), charge, boom)).decision).toBe("escalate");
    expect((await reviewCharge(state(), charge, null)).decision).toBe("escalate");
  });

  it("never passes the description into a pay reason", async () => {
    const r = await reviewCharge(state(), { number: 1, priceItem: implant, quantity: 1, amount: u("300"), description: "SECRET diagnosis" }, okJudge);
    expect(r.reason).not.toMatch(/SECRET/);
  });
});

describe("marginCallsNeeded", () => {
  it("asks the short payer for the expected remaining cost", () => {
    // Remaining: 1 consult (80 family) + 2 implants (420 coverer, 180 family)
    const calls = marginCallsNeeded(state({ covererBalance: u("400"), familyBalance: u("300") }));
    expect(calls).toEqual([{ role: "coverer", amount: u("20") }]);
  });

  it("counts only paid charges against the quote", () => {
    const past = [{ priceItemId: "p2", quantity: 2, amount: u("600"), status: "paid" as const }];
    expect(marginCallsNeeded(state({ past, covererBalance: 0n, familyBalance: u("80") }))).toEqual([]);
  });
});
