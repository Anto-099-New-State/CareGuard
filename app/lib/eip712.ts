import { config } from "./config";

// SHARED CONTRACT: must match the Solidity type string character for character.
// ApproveCharge(uint256 episodeId,bytes32 chargeHash,uint256 amount,uint256 coveredAmount,uint256 deadline)
// Change only together with CareGuardEpisode.sol.
export const APPROVE_CHARGE_TYPE =
  "ApproveCharge(uint256 episodeId,bytes32 chargeHash,uint256 amount,uint256 coveredAmount,uint256 deadline)";

export const eip712Domain = {
  name: "CareGuard",
  version: "1",
  chainId: config.chainId,
  verifyingContract: config.contractAddress,
} as const;

export const approveChargeTypes = {
  ApproveCharge: [
    { name: "episodeId", type: "uint256" },
    { name: "chargeHash", type: "bytes32" },
    { name: "amount", type: "uint256" },
    { name: "coveredAmount", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export type ApproveChargeMessage = {
  episodeId: bigint;
  chargeHash: `0x${string}`;
  amount: bigint;
  coveredAmount: bigint;
  deadline: bigint;
};
