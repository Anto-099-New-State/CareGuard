import { erc20Abi } from "viem";
import { careGuardAbi } from "./abi";
import { config } from "./config";

export { careGuardAbi, erc20Abi };

export const careGuard = { address: config.contractAddress, abi: careGuardAbi } as const;

/** Mirrors CareGuardEpisode.Status. */
export const CONTRACT_STATUS = ["none", "created", "active", "margin_call", "closed", "expired"] as const;
export type ContractStatus = (typeof CONTRACT_STATUS)[number];

/** Mirrors CareGuardEpisode.DecisionKind; order matches the database enum. */
export const DECISION_KIND = ["size", "review", "escalate", "margin_call", "discharge"] as const;
