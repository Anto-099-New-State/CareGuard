import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { config } from "../config";
import type { ChargeJudge, JudgeInput, JudgeVerdict } from "./review";

const MODEL = "claude-opus-5-5";

const Verdict = z.object({
  verdict: z.enum(["pay", "escalate"]),
  coveredAmount: z.string().describe("Covered part in USDC with two decimals, e.g. 220.00"),
  reason: z.string().describe("One plain sentence. No patient details, diagnoses or charge descriptions."),
});

const SYSTEM = `You review medical charges for CareGuard, an escrow that pays a provider per charge from two payers: a coverer (insurer or employer) and the family.

Each charge you see has already passed deterministic checks: it is on the provider's price list at the listed price, within the per-charge cap, within the quoted quantity, and both payers have enough funds for their share. Your job is to catch what those checks cannot: a description that doesn't match the price item, a charge that looks out of place given the quote and history, or a covered split that seems wrong for the coverage rules.

Decide "pay" when nothing looks unusual, otherwise "escalate" so a human approver checks it. Return coveredAmount equal to proposedCovered unless the coverage rules clearly say otherwise; a different value sends the charge to a human.

The reason is shown to the payers, so write one short plain sentence that refers to the price item code only. Never repeat the description, patient details or anything medical beyond the item label.`;

/** Claude judge for charges that pass every deterministic check. Returns null when no API key is set. */
export function claudeJudge(): ChargeJudge | null {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  const client = new Anthropic();

  return async (input: JudgeInput): Promise<JudgeVerdict> => {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: zodOutputFormat(Verdict) },
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(input, null, 2) }],
    });

    if (response.stop_reason === "refusal") throw new Error("Charge review was declined by the model.");
    if (!response.parsed_output) throw new Error("Charge review returned no verdict.");
    return response.parsed_output;
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
  return claudeJudge();
}
