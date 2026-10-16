import Groq from "groq-sdk";
import { z } from "zod";
import { config } from "../config";
import type { ChargeJudge, JudgeInput, JudgeVerdict } from "./review";

// Supports strict JSON-schema output on Groq.
const MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";

const Verdict = z.object({
  verdict: z.enum(["pay", "escalate"]),
  coveredAmount: z.string(),
  reason: z.string().min(1),
});

const SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["pay", "escalate"] },
    coveredAmount: { type: "string", description: "Covered part in USDC with two decimals, e.g. 220.00" },
    reason: { type: "string", description: "One plain sentence. No patient details, diagnoses or charge descriptions." },
  },
  required: ["verdict", "coveredAmount", "reason"],
  additionalProperties: false,
};

const SYSTEM = `You review medical charges for CareGuard, an escrow that pays a provider per charge from two payers: a coverer (insurer or employer) and the family.

Each charge you see has already passed deterministic checks: it is on the provider's price list at the listed price, within the per-charge cap, within the quoted quantity, and both payers have enough funds for their share. Your job is to catch what those checks cannot: a description that doesn't match the price item, a charge that looks out of place given the quote and history, or a covered split that seems wrong for the coverage rules.

Decide "pay" when nothing looks unusual, otherwise "escalate" so a human approver checks it. Return coveredAmount equal to proposedCovered unless the coverage rules clearly say otherwise; a different value sends the charge to a human.

The reason is shown to the payers, so write one short plain sentence that refers to the price item code only. Never repeat the description, patient details or anything medical beyond the item label.`;

/** Groq judge for charges that pass every deterministic check. Returns null when GROQ_API_KEY isn't set. */
export function groqJudge(): ChargeJudge | null {
  if (!process.env.GROQ_API_KEY) return null;
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

  return async (input: JudgeInput): Promise<JudgeVerdict> => {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify(input, null, 2) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "charge_verdict", strict: true, schema: SCHEMA } },
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Charge review returned no verdict.");
    // Validate even under strict mode: anything off-schema throws, and the caller escalates.
    return Verdict.parse(JSON.parse(content));
  };
}

/**
 * The judge the agent uses. AGENT_JUDGE=stub accepts every charge that passed the deterministic checks;
 * it exists for local end-to-end runs only and refuses to load on testnet or mainnet.
 */
export function chargeJudge(): ChargeJudge | null {
  if (process.env.AGENT_JUDGE === "stub") {
    if (config.network !== "local") throw new Error("AGENT_JUDGE=stub is only allowed on the local network.");
    return async (input) => ({ verdict: "pay", coveredAmount: input.proposedCovered, reason: "Local stub review." });
  }
  return groqJudge();
}
