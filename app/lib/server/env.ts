import type { Blockchain } from "@circle-fin/developer-controlled-wallets";
import { config } from "../config";

/** Reads a required server-side secret, failing with a message that says how to fix it. */
export function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Add it to app/.env.local (see .env.example) or the host's secret settings.`);
  return v;
}

export const isLocal = config.network === "local";

/** Circle's blockchain identifier for the current network. */
export function circleBlockchain(): Blockchain {
  return (process.env.CIRCLE_BLOCKCHAIN as Blockchain | undefined) ?? (config.network === "mainnet" ? "ARC" : "ARC-TESTNET");
}

/** App Kit chain name for the current network. */
export function appKitChain(): string {
  return process.env.APP_KIT_CHAIN ?? (config.network === "mainnet" ? "Arc" : "Arc_Testnet");
}

export const settings = {
  /** Episode expiry: 30 minutes on testnet and local (so refunds can be tested), 1 day on mainnet. */
  expirySeconds: Number(process.env.EPISODE_EXPIRY_SECONDS ?? (config.network === "mainnet" ? 86_400 : 1_800)),
  contingencyBps: Number(process.env.DEFAULT_CONTINGENCY_BPS ?? 2000),
  capBps: Number(process.env.DEFAULT_CAP_BPS ?? 2500),
  /** How long an approver's signature stays valid. */
  approvalTtlSeconds: Number(process.env.APPROVAL_TTL_SECONDS ?? 3600),
};
