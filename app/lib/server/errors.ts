import { BaseError, ContractFunctionRevertedError } from "viem";
import { formatAmount } from "../money";

/** An error whose message is safe and useful to show the user. Routes return it as { error }. */
export class UserError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const plain: Record<string, (args: readonly unknown[]) => string> = {
  NotAgent: () => "Only the CareGuard agent can do that.",
  NotApprover: () => "Only the approver can do that.",
  NotPayer: () => "This wallet isn't a payer on the episode.",
  ZeroAddress: () => "A wallet address is missing.",
  ZeroAmount: () => "The amount must be more than zero.",
  DuplicateParty: () => "Provider, coverer and family must be three different wallets.",
  ExpiryInPast: () => "The episode expiry must be in the future.",
  CapAboveGuarantee: () => "The per-charge cap can't be larger than the guarantee.",
  EpisodeNotFound: () => "That episode doesn't exist onchain.",
  EpisodeNotOpen: () => "The episode is already closed or expired.",
  EpisodeExpiredAlready: () => "The episode has expired. Payers can now trigger the refund.",
  NotYetExpired: () => "The episode hasn't expired yet.",
  AboveCap: ([amount, cap]) => `${formatAmount(amount as bigint)} USDC is above the ${formatAmount(cap as bigint)} USDC per-charge cap and needs the approver's signature.`,
  CoveredAboveAmount: () => "The covered part can't be larger than the charge.",
  ChargeAlreadyUsed: () => "This charge has already been paid.",
  InsufficientCovererBalance: ([needed, available]) =>
    `Coverer balance is ${formatAmount((needed as bigint) - (available as bigint))} USDC short of this charge.`,
  InsufficientFamilyBalance: ([needed, available]) =>
    `Family balance is ${formatAmount((needed as bigint) - (available as bigint))} USDC short of this charge.`,
  ApprovalExpired: () => "The approval has expired. Ask the approver to sign again.",
  InvalidApproval: () => "The approval signature doesn't match this charge.",
  NothingToClaim: () => "There's no refund waiting for this wallet.",
  ERC20InsufficientBalance: () => "The wallet doesn't hold enough USDC.",
  ERC20InsufficientAllowance: () => "The contract isn't approved to move this much USDC.",
};

/** Turns a contract revert into a plain sentence; returns null for anything that isn't a known revert. */
export function explainRevert(err: unknown): string | null {
  if (!(err instanceof BaseError)) return null;
  const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
  if (revert instanceof ContractFunctionRevertedError && revert.data?.errorName) {
    const f = plain[revert.data.errorName];
    return f ? f(revert.data.args ?? []) : `The contract refused: ${revert.data.errorName}.`;
  }
  return null;
}
